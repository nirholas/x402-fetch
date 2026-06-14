// Type definitions for @three-ws/x402-fetch/wallet

export function privateKeyToWallet(pk: string | Uint8Array): {
	address: string;
	signTypedData(typedData: unknown): Promise<string>;
};
