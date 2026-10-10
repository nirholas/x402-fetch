// @three-ws/x402-fetch — a drop-in `fetch` that silently answers x402 payment
// challenges. Wrap a wallet once, then call any paid three.ws (or CDP-x402)
// endpoint as if it were free: on a 402 the wrapper parses the challenge, signs
// a USDC-on-Base EIP-3009 authorization, and retries with the X-PAYMENT proof.
//
//   import { withX402 } from '@three-ws/x402-fetch';
//   const pay = withX402(wallet, { maxPaymentUsd: 0.10 });
//   const res = await pay('https://three.ws/api/mcp', { method: 'POST', body });
//
// Zero production dependencies — the secp256k1 / keccak256 / EIP-712 stack is
// inlined (src/crypto/*). See README for wallet forms and options.

import { adaptWallet, privateKeyToWallet } from './wallet.js';
import { parseChallenge, selectRequirement, amountToUsd } from './parse-challenge.js';
import { createPaymentHeader } from './client.js';

const DEFAULT_MAX_PAYMENT_USD = 0.1;
const DEFAULT_TIMEOUT_MS = 15000;

// The package supports three call conventions so the generated snippets across
// three.ws (wallet-first) and the upstream x402-fetch (fetch-first) both work:
//   withX402(wallet, options?)
//   withX402(fetch, wallet)                    // upstream wrapFetchWithPayment shape
//   withX402(fetch, { wallet, ...options })
function normalizeArgs(arg1, arg2) {
	// fetch-first: first arg is a base fetch implementation.
	if (typeof arg1 === 'function') {
		const baseFetch = arg1;
		if (arg2 && typeof arg2 === 'object' && 'wallet' in arg2) {
			const { wallet, ...options } = arg2;
			return { baseFetch, wallet, options };
		}
		return { baseFetch, wallet: arg2, options: {} };
	}
	// wallet-first (canonical).
	return {
		baseFetch: globalThis.fetch?.bind(globalThis),
		wallet: arg1,
		options: arg2 && typeof arg2 === 'object' ? arg2 : {},
	};
}

function withTimeout(promise, ms, label) {
	if (!ms || ms <= 0) return promise;
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`x402: ${label} timed out after ${ms}ms`)), ms);
		promise.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

/**
 * Wrap a wallet (and optionally a base fetch) into a fetch-compatible function
 * that automatically pays x402 challenges.
 * @returns {typeof fetch}
 */
export function withX402(arg1, arg2) {
	const { baseFetch, wallet, options } = normalizeArgs(arg1, arg2);
	if (typeof baseFetch !== 'function') {
		throw new Error('x402: no fetch implementation available (pass one or run on a platform with global fetch)');
	}
	const adapter = adaptWallet(wallet);
	const maxPaymentUsd = Number.isFinite(options.maxPaymentUsd)
		? options.maxPaymentUsd
		: DEFAULT_MAX_PAYMENT_USD;
	const timeout = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_TIMEOUT_MS;
	const onPayment = typeof options.onPayment === 'function' ? options.onPayment : null;
	const preferNetwork = options.network || options.preferNetwork || null;

	return async function paidFetch(input, init) {
		const first = await baseFetch(input, init);
		if (first.status !== 402) return first;

		const challenge = await parseChallenge(first);
		if (!challenge || !challenge.accepts.length) {
			throw new Error('x402: server returned 402 but no parseable payment challenge was found');
		}

		const accept = selectRequirement(challenge.accepts, { preferNetwork });
		if (!accept) {
			throw new Error(
				'x402: server requires payment but no supported network/asset was found in accepts[]. Supported: USDC on Base mainnet.',
			);
		}

		const usd = amountToUsd(accept);
		if (usd > maxPaymentUsd) {
			throw new Error(
				`x402: payment of $${usd.toFixed(4)} exceeds maxPaymentUsd limit of $${maxPaymentUsd.toFixed(4)} — raise the limit to authorize this call`,
			);
		}

		const requestUrl =
			typeof input === 'string' ? input : input?.url || challenge.resource?.url || String(input);
		const payTo = accept.payTo;
		if (onPayment) onPayment({ amount: usd, to: payTo, requestUrl });

		const xPayment = await withTimeout(
			createPaymentHeader({ accept, adapter }),
			timeout,
			'payment authorization',
		);

		const retryHeaders = new Headers(init?.headers || (typeof input === 'object' ? input.headers : undefined));
		retryHeaders.set('X-PAYMENT', xPayment);
		const retried = await baseFetch(input, { ...init, headers: retryHeaders });

		if (retried.status === 402) {
			throw new Error(
				'x402: payment submitted but server still returned 402 — check payment amount and recipient',
			);
		}
		return retried;
	};
}

// Upstream-compatible alias. Always fetch-first: wrapFetchWithPayment(fetch, wallet, options?).
export function wrapFetchWithPayment(fetchFn, wallet, options) {
	return withX402(fetchFn, options ? { wallet, ...options } : wallet);
}

export { privateKeyToWallet };
export default withX402;
