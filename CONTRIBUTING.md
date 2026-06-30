# Contributing to `@nirholas/x402-fetch`

Thanks for helping improve x402-fetch. This package has **zero runtime dependencies** by design — the secp256k1, keccak256, and EIP-712 stack is inlined under `src/crypto/`. Keep it that way: a PR that adds a production dependency needs a strong, documented reason.

## Project layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Public entry — `withX402`, `wrapFetchWithPayment`, `privateKeyToWallet`. |
| `src/client.js` | Builds and base64-encodes the x402 v2 `X-PAYMENT` payload. |
| `src/wallet.js` | Wallet adapter — normalizes private key / EIP-1193 / signer objects. |
| `src/parse-challenge.js` | Parses a 402 envelope and selects a payable requirement. |
| `src/crypto/` | Inlined secp256k1, keccak256, and EIP-712 (no external libs). |
| `src/*.d.ts` | TypeScript declarations (kept in sync by hand). |
| `tests/client.test.mjs` | Node test runner suite (the real signing stack, no mock signatures). |
| `docs/` | API reference and examples. |

## Local development

```bash
npm install      # dev deps only (vite); runtime deps stay at zero
npm run build    # vite build → dist/ (ESM + CJS for root and /wallet)
npm test         # node --test over tests/*.test.mjs
```

`npm run build && npm test` is exactly what `prepublishOnly` runs, so green locally means publishable.

## Tests

- Tests use Node's built-in test runner (`node:test` + `node:assert`), no framework.
- The suite signs with a **real deterministic private key** and asserts the produced EIP-3009 payload byte structure — never add mock signatures. If you touch `src/crypto/` or `src/client.js`, the existing assertions must still hold.
- Add a test for every behavior change. New wallet form, new option, new error path → new assertion.

## Pull request checklist

- [ ] `npm run build` succeeds.
- [ ] `npm test` is green (all 7+ tests).
- [ ] No new runtime dependency (or a documented justification in the PR).
- [ ] Public API changes are reflected in `src/index.d.ts`, `src/wallet.d.ts`, the `README.md`, and `docs/api.md`.
- [ ] New examples (if any) actually run against Node ≥ 18.

## Reporting issues

Open an issue at <https://github.com/nirholas/x402-fetch/issues> with the x402 challenge `accepts[]` you hit (redact addresses if needed), the wallet form, and the thrown `x402:` message.

## License

Proprietary — Copyright (c) 2026 nirholas. All Rights Reserved. Unauthorized use, copying, modification, or distribution is prohibited. By contributing you agree your contributions become the proprietary property of nirholas and are governed by the [LICENSE](./LICENSE).
