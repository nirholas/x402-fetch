// Wallet adapter — normalises every accepted wallet form to one internal
// interface: `{ address: Promise<string>, signTypedData(typedData) }` where
// signTypedData returns a 0x-prefixed 65-byte EIP-712 signature.
//
// Accepted inputs:
//   1. EIP-1193 provider (window.ethereum / any object with `.request`) — browser.
//   2. A pre-built wallet object `{ address, signTypedData(typedData) }` —
//      the three.ws agent SDK and viem LocalAccounts both satisfy this.
//   3. A private key (0x-hex string) via `privateKeyToWallet(pk)` — Node.

import { eip712Digest } from './crypto/eip712.js';
import {
	signDigest,
	normalizePrivateKey,
	privateKeyToAddress,
	toChecksumAddress,
} from './crypto/secp256k1.js';

function isEip1193(w) {
	return w && typeof w === 'object' && typeof w.request === 'function';
}

/**
 * Build a Node signer from a raw private key. Signs EIP-712 typed data locally
 * with the inlined secp256k1 implementation — no external wallet library.
 * @param {string|Uint8Array} pk 32-byte private key (0x-hex or bytes)
 * @returns {{ address: string, signTypedData: (td: any) => Promise<string> }}
 */
export function privateKeyToWallet(pk) {
	const key = normalizePrivateKey(pk);
	const address = toChecksumAddress(privateKeyToAddress(key));
	return {
		address,
		async signTypedData(typedData) {
			return signDigest(eip712Digest(typedData), key);
		},
	};
}

// Resolve the payer address for a wallet form, prompting the EIP-1193 provider
// for accounts when necessary.
async function resolveAddress(wallet) {
	if (typeof wallet === 'string') return privateKeyToWallet(wallet).address;
	if (isEip1193(wallet)) {
		const accounts = await wallet.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? accounts[0] : null;
		if (!addr) throw new Error('x402: wallet returned no account');
		return addr;
	}
	// Pre-built wallet object (three.ws SDK / viem LocalAccount / viem WalletClient).
	const addr = wallet?.address || wallet?.account?.address;
	if (!addr) throw new Error('x402: wallet object must expose an `address`');
	return addr;
}

const USER_REJECTED = /user rejected|user denied|reject|cancell?ed|4001/i;

/**
 * Normalise any accepted wallet form into `{ getAddress(), signTypedData(td) }`.
 * @param {any} wallet
 */
export function adaptWallet(wallet) {
	if (wallet == null) throw new Error('x402: a wallet is required');

	let cachedAddress = null;
	const getAddress = async () => {
		if (!cachedAddress) cachedAddress = await resolveAddress(wallet);
		return cachedAddress;
	};

	const signTypedData = async (typedData) => {
		try {
			if (typeof wallet === 'string') {
				return await privateKeyToWallet(wallet).signTypedData(typedData);
			}
			if (isEip1193(wallet)) {
				const from = await getAddress();
				return await wallet.request({
					method: 'eth_signTypedData_v4',
					params: [from, JSON.stringify(typedData)],
				});
			}
			if (typeof wallet.signTypedData === 'function') {
				// viem accounts take the typed-data object directly; the three.ws SDK
				// wallet uses the same shape. Both resolve to a hex signature.
				return await wallet.signTypedData(typedData);
			}
			throw new Error('x402: wallet does not support signTypedData');
		} catch (err) {
			if (USER_REJECTED.test(err?.message || String(err))) {
				throw new Error('x402: user rejected payment');
			}
			throw err;
		}
	};

	return { getAddress, signTypedData };
}
