// Type definitions for @nirholas/x402-fetch/wallet

export function privateKeyToWallet(pk: string | Uint8Array): {
	address: string;
	signTypedData(typedData: unknown): Promise<string>;
};
