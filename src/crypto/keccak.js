// Keccak-256 (the hash Ethereum uses — NOT FIPS-202 SHA3, which differs only in
// the domain-separation pad byte). Pure JavaScript, zero dependencies.
//
// Implemented with BigInt lanes for legibility and correctness over raw speed:
// the only inputs we hash are 32-byte EIP-712 digests and 64-byte public keys,
// so the BigInt overhead is irrelevant and a hand-unrolled uint32 variant would
// only add risk. Verified against the canonical empty-input vector
// (keccak256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470).

const MASK64 = (1n << 64n) - 1n;

// Round constants for Keccak-f[1600] (24 rounds).
const RC = [
	0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
	0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
	0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
	0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
	0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
	0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets ρ, indexed by lane position x + 5*y.
const ROT = [
	0n, 1n, 62n, 28n, 27n,
	36n, 44n, 6n, 55n, 20n,
	3n, 10n, 43n, 25n, 39n,
	41n, 45n, 15n, 21n, 8n,
	18n, 2n, 61n, 56n, 14n,
];

function rotl(x, n) {
	if (n === 0n) return x & MASK64;
	return ((x << n) | (x >> (64n - n))) & MASK64;
}

function keccakF(state) {
	for (let round = 0; round < 24; round++) {
		// θ
		const C = new Array(5);
		for (let x = 0; x < 5; x++) {
			C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
		}
		const D = new Array(5);
		for (let x = 0; x < 5; x++) {
			D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1n);
		}
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) state[x + 5 * y] = state[x + 5 * y] ^ D[x];
		}
		// ρ and π
		const B = new Array(25);
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				const idx = x + 5 * y;
				const newX = y;
				const newY = (2 * x + 3 * y) % 5;
				B[newX + 5 * newY] = rotl(state[idx], ROT[idx]);
			}
		}
		// χ
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				state[x + 5 * y] =
					B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & B[((x + 2) % 5) + 5 * y]);
				state[x + 5 * y] &= MASK64;
			}
		}
		// ι
		state[0] ^= RC[round];
	}
}

/**
 * Keccac-256 digest.
 * @param {Uint8Array} input
 * @returns {Uint8Array} 32-byte digest
 */
export function keccak256(input) {
	const rate = 136; // 1088-bit rate for the 256-bit capacity variant
	const state = new Array(25).fill(0n);

	// Pad: append 0x01, zero-fill, set high bit of the final rate byte (pad10*1).
	const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
	padded.set(input);
	padded[input.length] = 0x01;
	padded[padded.length - 1] |= 0x80;

	// Absorb
	for (let offset = 0; offset < padded.length; offset += rate) {
		for (let i = 0; i < rate / 8; i++) {
			let lane = 0n;
			for (let b = 0; b < 8; b++) {
				lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(8 * b);
			}
			state[i] ^= lane;
		}
		keccakF(state);
	}

	// Squeeze (single block — 32 bytes ≤ rate)
	const out = new Uint8Array(32);
	for (let i = 0; i < 4; i++) {
		let lane = state[i];
		for (let b = 0; b < 8; b++) {
			out[i * 8 + b] = Number(lane & 0xffn);
			lane >>= 8n;
		}
	}
	return out;
}
