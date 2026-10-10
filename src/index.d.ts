// Type definitions for @three-ws/x402-fetch

export interface EIP1193Provider {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

export interface TypedDataSigner {
	address?: string;
	account?: { address: string };
	signTypedData(typedData: unknown): Promise<string>;
}

/**
 * A wallet accepted by `withX402`. One of:
 *  - a 0x-prefixed private key string (Node),
 *  - an EIP-1193 provider (browser `window.ethereum`),
 *  - a pre-built signer object `{ address, signTypedData }` (three.ws SDK / viem account).
 */
export type Wallet = string | EIP1193Provider | TypedDataSigner;

export interface X402PaymentInfo {
	/** Amount in USD that will be paid for this request. */
	amount: number;
	/** Recipient address (payTo) from the selected requirement. */
	to: string;
	/** URL of the request being paid for. */
	requestUrl: string;
}

export interface X402Options {
	/** Refuse to auto-pay more than this many USD per request. Default: 0.10. */
	maxPaymentUsd?: number;
	/** Called immediately before signing each payment. */
	onPayment?: (info: X402PaymentInfo) => void;
	/** Milliseconds to wait for payment authorization before aborting. Default: 15000. */
	timeout?: number;
	/** Prefer this CAIP-2 network id from accepts[] (e.g. "eip155:8453"). */
	network?: string;
}

/** Wrap a wallet into a fetch that automatically pays x402 challenges. */
export function withX402(wallet: Wallet, options?: X402Options): typeof fetch;
/** fetch-first convention: withX402(fetch, wallet) or withX402(fetch, { wallet, ...options }). */
export function withX402(
	baseFetch: typeof fetch,
	wallet: Wallet | ({ wallet: Wallet } & X402Options),
): typeof fetch;

/** Upstream-compatible alias: wrapFetchWithPayment(fetch, wallet, options?). */
export function wrapFetchWithPayment(
	fetchFn: typeof fetch,
	wallet: Wallet,
	options?: X402Options,
): typeof fetch;

/** Build a Node signer from a raw private key (no external wallet library). */
export function privateKeyToWallet(pk: string | Uint8Array): {
	address: string;
	signTypedData(typedData: unknown): Promise<string>;
};

export default withX402;
