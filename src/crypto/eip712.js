// EIP-712 typed structured-data hashing — pure JavaScript, zero dependencies.
//
// Produces the 32-byte digest that gets ECDSA-signed for an
// `eth_signTypedData_v4` request: keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message)).
// Only the value types the x402 EIP-3009 TransferWithAuthorization payload uses
// are implemented (address, uintN, bool, bytesN, bytes, string) — enough to be a
// correct general encoder for flat structs without dragging in nested-struct
// recursion we don't need.

import { keccak256 } from './keccak.js';
import { hexToBytes, bytesToHex } from './secp256k1.js';

function toBigInt(v) {
	if (typeof v === 'bigint') return v;
	if (typeof v === 'number') return BigInt(v);
	if (typeof v === 'string') return v.startsWith('0x') ? BigInt(v) : BigInt(v);
	throw new Error(`x402: cannot coerce ${typeof v} to integer`);
}

function pad32(bytes) {
	if (bytes.length > 32) throw new Error('x402: value exceeds 32 bytes');
	const out = new Uint8Array(32);
	out.set(bytes, 32 - bytes.length);
	return out;
}

function uintToBytes(v) {
	let n = toBigInt(v);
	const out = new Uint8Array(32);
	for (let i = 31; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

// Encode a single field value to its 32-byte EIP-712 representation.
function encodeValue(type, value) {
	if (type === 'string') {
		return keccak256(new TextEncoder().encode(String(value)));
	}
	if (type === 'bytes') {
		return keccak256(hexToBytes(value));
	}
	if (type === 'bool') {
		return uintToBytes(value ? 1 : 0);
	}
	if (type === 'address') {
		return pad32(hexToBytes(String(value).toLowerCase()));
	}
	if (type.startsWith('uint') || type.startsWith('int')) {
		return uintToBytes(value);
	}
	if (type.startsWith('bytes')) {
		// Fixed bytesN — left-aligned (high-order), already ≤32 bytes.
		const bytes = hexToBytes(value);
		const out = new Uint8Array(32);
		out.set(bytes.slice(0, 32), 0);
		return out;
	}
	throw new Error(`x402: unsupported EIP-712 type "${type}"`);
}

function encodeType(primaryType, types) {
	const fields = types[primaryType];
	const args = fields.map((f) => `${f.type} ${f.name}`).join(',');
	return `${primaryType}(${args})`;
}

function typeHash(primaryType, types) {
	return keccak256(new TextEncoder().encode(encodeType(primaryType, types)));
}

function hashStruct(primaryType, data, types) {
	const parts = [typeHash(primaryType, types)];
	for (const field of types[primaryType]) {
		parts.push(encodeValue(field.type, data[field.name]));
	}
	const encoded = new Uint8Array(parts.length * 32);
	parts.forEach((p, i) => encoded.set(p, i * 32));
	return keccak256(encoded);
}

/**
 * Compute the EIP-712 signing digest for a typed-data object of the shape
 * `{ domain, types, primaryType, message }` (the same object passed to
 * `eth_signTypedData_v4`).
 * @returns {Uint8Array} 32-byte digest
 */
export function eip712Digest({ domain, types, primaryType, message }) {
	const domainSeparator = hashStruct('EIP712Domain', domain, types);
	const structHash = hashStruct(primaryType, message, types);
	const prefixed = new Uint8Array(2 + 32 + 32);
	prefixed[0] = 0x19;
	prefixed[1] = 0x01;
	prefixed.set(domainSeparator, 2);
	prefixed.set(structHash, 34);
	return keccak256(prefixed);
}

export { bytesToHex };
