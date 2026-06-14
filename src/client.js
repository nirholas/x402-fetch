// Payment client — turns a selected 402 requirement + a wallet into a signed
// X-PAYMENT header, mirroring the wire shape the three.ws server verifies
// (api/_lib/x402-spec.js) and the in-repo browser paywall builds
// (public/x402-pay-core.js): an EIP-3009 transferWithAuthorization signature
// wrapped in a v2 PaymentPayload.

import { isEvmNetwork } from './parse-challenge.js';

const EVM_CHAIN_IDS = {
	'eip155:8453': 8453,
	'eip155:84532': 84532,
	'eip155:42161': 42161,
	'eip155:1': 1,
	'eip155:10': 10,
};

function randomNonce() {
	const arr = new Uint8Array(32);
	(globalThis.crypto || crypto).getRandomValues(arr);
	return '0x' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function b64encode(obj) {
	const json = JSON.stringify(obj);
	if (typeof Buffer !== 'undefined') return Buffer.from(json, 'utf8').toString('base64');
	return btoa(unescape(encodeURIComponent(json)));
}

/**
 * Build EIP-3009 transferWithAuthorization typed data for a USDC payment.
 * `nowSeconds` and `nonce` are injectable so builds are deterministic in tests.
 */
export function buildEip3009TypedData({ accept, payerAddress, chainId, nowSeconds, nonce }) {
	const now = nowSeconds != null ? nowSeconds : Math.floor(Date.now() / 1000);
	const validBefore = now + (Number(accept.maxTimeoutSeconds) || 600);
	const domain = {
		name: accept.extra?.name || 'USD Coin',
		version: accept.extra?.version || '2',
		chainId,
		verifyingContract: accept.asset,
	};
	const types = {
		EIP712Domain: [
			{ name: 'name', type: 'string' },
			{ name: 'version', type: 'string' },
			{ name: 'chainId', type: 'uint256' },
			{ name: 'verifyingContract', type: 'address' },
		],
		TransferWithAuthorization: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'validAfter', type: 'uint256' },
			{ name: 'validBefore', type: 'uint256' },
			{ name: 'nonce', type: 'bytes32' },
		],
	};
	// The x402 v2 `exact` PaymentRequirements schema (and the CDP facilitator that
	// validates it) require the authorization's numeric fields as decimal STRINGS.
	// The signed EIP-712 message hashes them as uint256 either way, so the
	// signature stays valid; the strings are what the facilitator parses.
	const authorization = {
		from: payerAddress,
		to: accept.payTo,
		value: String(accept.amount),
		validAfter: '0',
		validBefore: String(validBefore),
		nonce: nonce || randomNonce(),
	};
	return {
		typedData: { primaryType: 'TransferWithAuthorization', types, domain, message: authorization },
		authorization,
	};
}

// Assemble the x402 v2 `exact`-scheme PaymentPayload. The shape mirrors
// @x402/evm's ExactEvmScheme exactly — `{ x402Version, scheme, network,
// payload: { authorization, signature } }` with NO extra keys, since the CDP
// facilitator's schema union rejects anything that doesn't match a branch.
export function buildPaymentPayload({ accept, signature, authorization }) {
	return {
		x402Version: 2,
		scheme: accept.scheme || 'exact',
		network: accept.network,
		// The CDP v2 schema requires the matched requirement echoed back as
		// `accepted` so the facilitator binds the payment to the exact offer.
		accepted: accept,
		payload: { authorization, signature },
	};
}

/**
 * Sign the selected requirement and return the base64 X-PAYMENT header value.
 * @param {{ accept: any, adapter: { getAddress: () => Promise<string>, signTypedData: (td:any)=>Promise<string> }, resourceUrl?: string, nowSeconds?: number, nonce?: string }} args
 * @returns {Promise<string>}
 */
export async function createPaymentHeader({ accept, adapter, nowSeconds, nonce }) {
	if (!isEvmNetwork(accept.network)) {
		throw new Error(
			`x402: network "${accept.network}" is not locally signable by @three-ws/x402-fetch (EVM EIP-3009 / USDC on Base only)`,
		);
	}
	const chainId = EVM_CHAIN_IDS[accept.network];
	if (!chainId) throw new Error(`x402: unknown EVM chain for network "${accept.network}"`);
	if (!accept.asset) throw new Error('x402: payment requirement is missing an asset address');

	const payerAddress = await adapter.getAddress();
	const { typedData, authorization } = buildEip3009TypedData({
		accept,
		payerAddress,
		chainId,
		nowSeconds,
		nonce,
	});
	const signature = await adapter.signTypedData(typedData);
	const payload = buildPaymentPayload({ accept, signature, authorization });
	return b64encode(payload);
}

export { b64encode };
