# API reference — `@nirholas/x402-fetch`

Complete reference for every public export. For a guided introduction, start with the [README](../README.md). For runnable scripts, see [`examples.md`](./examples.md).

All exports are available from the package root:

```js
import withX402, {
  withX402,
  wrapFetchWithPayment,
  privateKeyToWallet,
} from '@nirholas/x402-fetch';
```

`privateKeyToWallet` is **also** available from the lighter `@nirholas/x402-fetch/wallet` subpath (signer only, no fetch wrapper).

---

## `withX402(arg1, arg2?)` → `typeof fetch`

The primary export, also the default export. Returns a function with the same signature as `fetch` that automatically pays x402 (HTTP 402) challenges.

### Call conventions

`withX402` normalizes three argument shapes:

| Form | `arg1` | `arg2` | Notes |
| --- | --- | --- | --- |
| Wallet-first (canonical) | `Wallet` | `X402Options?` | Uses `globalThis.fetch`. |
| Fetch-first | `typeof fetch` | `Wallet` | Matches upstream `wrapFetchWithPayment(fetch, wallet)`. |
| Fetch-first + options | `typeof fetch` | `{ wallet, ...X402Options }` | Options bundled with the wallet. |

Detection rule: if `arg1` is a function, it is treated as the base fetch (fetch-first); otherwise `arg1` is the wallet and the platform's global `fetch` is used.

### Returns

A `paidFetch(input, init?)` function:

- `input`: `string | URL | Request` — same as `fetch`.
- `init`: `RequestInit | undefined` — same as `fetch`.
- Resolves to a `Response`.

Behavior:

1. Calls the base fetch with `(input, init)`.
2. If the response status is **not** `402`, returns it unchanged.
3. On `402`, parses the challenge, selects a payable requirement, enforces `maxPaymentUsd`, signs the EIP-3009 authorization, fires `onPayment`, and **retries** the original request with an added `X-PAYMENT` header.
4. Returns the retried response. If it is still `402`, throws.

Headers from the original request (whether on `init.headers` or `Request#headers`) are preserved on the retry; `X-PAYMENT` is set on top.

### Throws

Synchronously (when called):

- `x402: no fetch implementation available (...)` — no global `fetch` and none passed.
- `x402: a wallet is required` — `wallet` is `null`/`undefined`.

Asynchronously (from the returned function) — see [Errors](#errors).

---

## `wrapFetchWithPayment(fetchFn, wallet, options?)` → `typeof fetch`

Upstream-compatible alias. Always fetch-first. Implemented as:

```js
withX402(fetchFn, options ? { wallet, ...options } : wallet)
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `fetchFn` | `typeof fetch` | — | Base fetch to wrap. Required. |
| `wallet` | `Wallet` | — | The signer. Required. |
| `options` | `X402Options` | `undefined` | Same options as `withX402`. |

---

## `privateKeyToWallet(pk)` → `{ address, signTypedData }`

Builds a local Node signer from a raw private key using the inlined secp256k1 / keccak256 / EIP-712 stack. No external wallet library.

| Parameter | Type | Description |
| --- | --- | --- |
| `pk` | `string \| Uint8Array` | 32-byte private key as `0x`-hex string or raw bytes. |

### Returns

| Field | Type | Description |
| --- | --- | --- |
| `address` | `string` | EIP-55 checksummed address derived from the key. |
| `signTypedData` | `(typedData) => Promise<string>` | Signs an `eth_signTypedData_v4`-shaped object, returning a `0x`-prefixed 65-byte (`r‖s‖v`) recoverable signature (`v ∈ {27,28}`, low-`s` per EIP-2, RFC-6979 deterministic `k`). |

### Throws

- `x402: private key must be 32 bytes`
- `x402: private key out of range`
- `x402: Web Crypto (crypto.subtle) is required for private-key signing` — if the runtime lacks `crypto.subtle` (used for the RFC-6979 HMAC).

---

## Types

### `Wallet`

```ts
type Wallet = string | EIP1193Provider | TypedDataSigner;
```

| Variant | Shape | Used in |
| --- | --- | --- |
| Private key | `0x`-hex string | Node |
| EIP-1193 provider | `{ request(args) => Promise<unknown> }` | Browser (`window.ethereum`) |
| Custom signer | `{ address?, account?: { address }, signTypedData(typedData) => Promise<string> }` | viem account, KMS, SDK |

Address resolution order for a custom signer: `wallet.address`, then `wallet.account.address`. If neither is present, throws `x402: wallet object must expose an 'address'`.

### `X402Options`

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `maxPaymentUsd` | `number` | `0.10` | Per-request USD ceiling. Over-limit throws before signing. |
| `onPayment` | `(info: X402PaymentInfo) => void` | — | Fired immediately before signing each payment. |
| `timeout` | `number` | `15000` | Milliseconds allowed for the signing step. `0` disables. |
| `network` | `string` | — | Preferred CAIP-2 network from `accepts[]`. Also read from `preferNetwork`. |

### `X402PaymentInfo`

```ts
interface X402PaymentInfo {
  amount: number;     // USD (atomic amount ÷ 10^decimals)
  to: string;         // payTo recipient from the selected requirement
  requestUrl: string; // URL being paid for
}
```

---

## Payment selection

From the challenge's `accepts[]`, `withX402` keeps requirements that are:

- **payable** — `amount` (or `maxAmountRequired`) is not `"0"`, and `extra.authRequired` is unset; and
- **EIP-3009-signable** — network is `eip155:*`, `scheme` is `exact` (or unset), and `extra.assetTransferMethod` is `eip3009` (or unset).

Among those it prefers, in order: the `network` option (if it matches one), then Base mainnet (`eip155:8453`), then the first remaining entry.

If none qualify, the request throws `x402: ... no supported network/asset was found in accepts[]. Supported: USDC on Base mainnet.`

### Supported EVM chains

| Network | CAIP-2 | Chain id |
| --- | --- | --- |
| Base | `eip155:8453` | 8453 |
| Base Sepolia | `eip155:84532` | 84532 |
| Arbitrum One | `eip155:42161` | 42161 |
| Ethereum | `eip155:1` | 1 |
| Optimism | `eip155:10` | 10 |

---

## Wire format

The signed `X-PAYMENT` header is the base64 of an x402 v2 `exact`-scheme `PaymentPayload`:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "eip155:8453",
  "accepted": { "...": "the matched requirement, echoed back" },
  "payload": {
    "authorization": {
      "from": "0x…",
      "to": "0x…",
      "value": "50000",
      "validAfter": "0",
      "validBefore": "1735689600",
      "nonce": "0x… (32 bytes)"
    },
    "signature": "0x… (65 bytes)"
  }
}
```

Numeric authorization fields are emitted as **decimal strings** (the CDP facilitator schema requires it); the EIP-712 hash treats them as `uint256` either way, so the signature stays valid. `validBefore` is `now + (accept.maxTimeoutSeconds || 600)`; `nonce` is a fresh 32 random bytes.

---

## Errors

All errors are plain `Error` instances; messages begin with `x402:`. Branch on `err.message`.

| Message (substring) | Cause |
| --- | --- |
| `no fetch implementation available` | No `fetch` to wrap (thrown at wrap time). |
| `a wallet is required` | `wallet` was `null`/`undefined`. |
| `wallet object must expose an 'address'` | Custom signer had no `address`/`account.address`. |
| `wallet returned no account` | EIP-1193 `eth_requestAccounts` returned nothing. |
| `wallet does not support signTypedData` | Custom signer lacked `signTypedData`. |
| `user rejected payment` | EIP-1193 rejection (4001 / "user denied"). |
| `server returned 402 but no parseable payment challenge` | 402 with no valid x402 envelope. |
| `no supported network/asset was found in accepts[]` | No EIP-3009 USDC EVM requirement offered. |
| `exceeds maxPaymentUsd limit` | Price above the ceiling. Nothing signed. |
| `payment authorization timed out after Nms` | Signing exceeded `timeout`. |
| `payment submitted but server still returned 402` | Retry still gated. |
| `network "X" is not locally signable` | Selected requirement was non-EVM. |
| `unknown EVM chain for network "X"` | EVM network not in the supported chain map. |
| `payment requirement is missing an asset address` | Selected requirement had no `asset`. |
| `private key must be 32 bytes` / `private key out of range` | Invalid key in `privateKeyToWallet`. |
