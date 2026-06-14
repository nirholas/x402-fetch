// secp256k1 ECDSA — pure JavaScript, zero dependencies.
//
// Just enough of the curve to: derive an Ethereum address from a private key and
// produce a 65-byte (r‖s‖v) recoverable signature over a 32-byte digest, with
// RFC-6979 deterministic nonces and low-s normalisation — byte-for-byte what
// MetaMask's eth_signTypedData_v4 and viem's signTypedData emit, so the x402
// facilitator's ecrecover lands on the same address.
//
// HMAC-SHA256 (for RFC-6979) and SHA-256 come from Web Crypto (globalThis.crypto.subtle),
// which is present in Node ≥18 and every modern browser — keeping the dependency
// count at zero without re-implementing two more hashes by hand.

import { keccak256 } from './keccak.js';

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
const B = 7n;

function mod(a, m) {
	const r = a % m;
	return r >= 0n ? r : r + m;
}

// Modular inverse via the extended Euclidean algorithm.
function invMod(a, m) {
	a = mod(a, m);
	let [old_r, r] = [a, m];
	let [old_s, s] = [1n, 0n];
	while (r !== 0n) {
		const q = old_r / r;
		[old_r, r] = [r, old_r - q * r];
		[old_s, s] = [s, old_s - q * s];
	}
	if (old_r !== 1n) throw new Error('x402: not invertible');
	return mod(old_s, m);
}

// Affine point arithmetic. `null` is the point at infinity.
function pointAdd(p, q) {
	if (p === null) return q;
	if (q === null) return p;
	const [x1, y1] = p;
	const [x2, y2] = q;
	if (x1 === x2 && mod(y1 + y2, P) === 0n) return null;
	let m;
	if (x1 === x2 && y1 === y2) {
		m = mod(3n * x1 * x1 * invMod(2n * y1, P), P);
	} else {
		m = mod((y2 - y1) * invMod(x2 - x1, P), P);
	}
	const x3 = mod(m * m - x1 - x2, P);
	const y3 = mod(m * (x1 - x3) - y1, P);
	return [x3, y3];
}

function scalarMul(k, point) {
	let result = null;
	let addend = point;
	while (k > 0n) {
		if (k & 1n) result = pointAdd(result, addend);
		addend = pointAdd(addend, addend);
		k >>= 1n;
	}
	return result;
}

function bytesToBig(bytes) {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

function bigToBytes(n, length) {
	const out = new Uint8Array(length);
	for (let i = length - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

export function hexToBytes(hex) {
	let h = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (h.length % 2) h = '0' + h;
	const out = new Uint8Array(h.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function bytesToHex(bytes) {
	let s = '0x';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

function getSubtle() {
	const c = globalThis.crypto;
	if (!c || !c.subtle) {
		throw new Error('x402: Web Crypto (crypto.subtle) is required for private-key signing');
	}
	return c.subtle;
}

async function hmacSha256(key, msg) {
	const subtle = getSubtle();
	const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await subtle.sign('HMAC', k, msg));
}

function concatBytes(...arrays) {
	const total = arrays.reduce((n, a) => n + a.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const a of arrays) {
		out.set(a, off);
		off += a.length;
	}
	return out;
}

// RFC-6979 §3.2 — deterministic k generation using HMAC-SHA256.
async function rfc6979(privKey, msgHash) {
	const x = bigToBytes(privKey, 32);
	const h1 = msgHash; // already a 32-byte hash, qlen == hlen == 256
	let v = new Uint8Array(32).fill(1);
	let k = new Uint8Array(32).fill(0);
	k = await hmacSha256(k, concatBytes(v, new Uint8Array([0]), x, h1));
	v = await hmacSha256(k, v);
	k = await hmacSha256(k, concatBytes(v, new Uint8Array([1]), x, h1));
	v = await hmacSha256(k, v);
	for (;;) {
		v = await hmacSha256(k, v);
		const candidate = bytesToBig(v);
		if (candidate >= 1n && candidate < N) return candidate;
		k = await hmacSha256(k, concatBytes(v, new Uint8Array([0])));
		v = await hmacSha256(k, v);
	}
}

/**
 * Sign a 32-byte digest with a private key, returning a 65-byte recoverable
 * signature (r‖s‖v) where v ∈ {27, 28} — the Ethereum convention.
 * @param {Uint8Array} digest 32-byte message hash
 * @param {bigint} privKey
 * @returns {Promise<string>} 0x-prefixed 65-byte hex signature
 */
export async function signDigest(digest, privKey) {
	const z = bytesToBig(digest);
	for (;;) {
		const k = await rfc6979(privKey, digest);
		const R = scalarMul(k, [Gx, Gy]);
		const r = mod(R[0], N);
		if (r === 0n) continue;
		let s = mod(invMod(k, N) * (z + r * privKey), N);
		if (s === 0n) continue;
		// Recovery id: low bit is R.y parity; bit 1 set when R.x overflowed N.
		let recovery = (R[1] & 1n ? 1 : 0) | (R[0] >= N ? 2 : 0);
		// Enforce low-s (EIP-2). Flipping s flips the y-parity, hence the recovery bit.
		if (s > N / 2n) {
			s = N - s;
			recovery ^= 1;
		}
		const sig = concatBytes(bigToBytes(r, 32), bigToBytes(s, 32), new Uint8Array([27 + recovery]));
		return bytesToHex(sig);
	}
}

/** Public key (uncompressed, 64 bytes X‖Y without the 0x04 prefix) for a private key. */
export function privateKeyToPublicKey(privKey) {
	const Q = scalarMul(privKey, [Gx, Gy]);
	if (!Q) throw new Error('x402: invalid private key');
	return concatBytes(bigToBytes(Q[0], 32), bigToBytes(Q[1], 32));
}

/** Checksummed-lowercase Ethereum address (0x + 40 hex) for a private key. */
export function privateKeyToAddress(privKey) {
	const pub = privateKeyToPublicKey(privKey);
	const hash = keccak256(pub);
	return bytesToHex(hash.slice(12));
}

export function normalizePrivateKey(pk) {
	const bytes = typeof pk === 'string' ? hexToBytes(pk) : pk;
	if (bytes.length !== 32) throw new Error('x402: private key must be 32 bytes');
	const n = bytesToBig(bytes);
	if (n <= 0n || n >= N) throw new Error('x402: private key out of range');
	return n;
}

// EIP-55 checksum casing for display addresses.
export function toChecksumAddress(address) {
	const addr = address.toLowerCase().replace(/^0x/, '');
	const hash = keccak256(new TextEncoder().encode(addr));
	let out = '0x';
	for (let i = 0; i < addr.length; i++) {
		const nibble = hash[i >> 1] >> (i % 2 === 0 ? 4 : 0);
		out += (nibble & 0x8) !== 0 ? addr[i].toUpperCase() : addr[i];
	}
	return out;
}
