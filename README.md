# @three-ws/x402-fetch

<!-- three.ws:badges -->
[![GitHub stars](https://img.shields.io/github/stars/nirholas/x402-fetch?style=flat&logo=github)](https://github.com/nirholas/x402-fetch/stargazers) [![License](https://img.shields.io/github/license/nirholas/x402-fetch?style=flat)](https://github.com/nirholas/x402-fetch/blob/HEAD/LICENSE) [![Last commit](https://img.shields.io/github/last-commit/nirholas/x402-fetch?style=flat)](https://github.com/nirholas/x402-fetch/commits) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat)](https://github.com/nirholas/x402-fetch/pulls) [![AI agent friendly](https://img.shields.io/badge/AI%20agents-AGENTS.md%20%2B%20llms.txt-6d5dfc?style=flat)](https://github.com/nirholas/x402-fetch/blob/HEAD/AGENTS.md)
<!-- /three.ws:badges -->


A drop-in `fetch` that silently answers [x402](https://x402.org) payment
challenges. Wrap a wallet once, then call any paid [three.ws](https://three.ws)
(or CDP-x402 / agentic.market) endpoint as if it were free.

```bash
npm install @three-ws/x402-fetch
```

- **Zero production dependencies.** The secp256k1 / keccak256 / EIP-712 signing
  stack is inlined — no `viem`, `ethers`, or `@wagmi/core` pulled into your bundle.
- **Works in the browser and Node.** MetaMask / EIP-1193 providers, the three.ws
  agent SDK wallet, or a raw private key all work.
- **Safe by default.** A `maxPaymentUsd` guard refuses to auto-pay more than you
  authorize. Descriptive errors instead of silent failures.
- **USDC on Base.** Signs EIP-3009 `transferWithAuthorization` — the same payload
  MetaMask's `eth_signTypedData_v4` produces, byte-for-byte.

## Quick start

```js
import { withX402 } from '@three-ws/x402-fetch';

// Browser: pass the injected wallet provider.
const pay = withX402(window.ethereum, { maxPaymentUsd: 0.1 });

const res = await pay('https://three.ws/api/mcp', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});

const data = await res.json(); // paid + unlocked, transparently
```

On a `402 Payment Required`, the wrapper parses the challenge, selects the USDC-on-Base
requirement, signs the authorization, and retries with the `X-PAYMENT` header — all
before your `await` resolves. Non-402 responses pass through untouched.

## Wallet forms

**Browser (MetaMask / any EIP-1193 provider):**

```js
withX402(window.ethereum);
```

**Node.js (private key):**

```js
import { withX402 } from '@three-ws/x402-fetch';
import { privateKeyToWallet } from '@three-ws/x402-fetch/wallet';

const pay = withX402(privateKeyToWallet(process.env.WALLET_PRIVATE_KEY));
```

**Pre-built signer (three.ws agent SDK / viem account):**

```js
withX402({ address, signTypedData });
```

## Options

```js
withX402(wallet, {
	maxPaymentUsd: 1.0, // refuse to auto-pay more than this per request (default 0.10)
	onPayment: ({ amount, to, requestUrl }) => console.log(`paying $${amount} to ${to}`),
	timeout: 30000, // ms to wait for payment authorization (default 15000)
	network: 'eip155:8453', // prefer a specific CAIP-2 network from accepts[]
});
```

`maxPaymentUsd` is a hard guard: a challenge above the limit throws rather than
paying, so a misconfigured or hostile server can never silently overcharge you.

## Compatibility alias

For parity with the upstream `x402-fetch` package, `wrapFetchWithPayment` is
exported with the fetch-first signature:

```js
import { wrapFetchWithPayment } from '@three-ws/x402-fetch';
const pay = wrapFetchWithPayment(fetch, wallet);
```

## Errors

| Message | Meaning |
| --- | --- |
| `no supported network/asset was found in accepts[]` | The server only offered networks/assets this wrapper can't sign (it signs USDC on Base / EVM EIP-3009). |
| `payment of $X exceeds maxPaymentUsd limit` | The challenge asked for more than your authorized ceiling. |
| `user rejected payment` | The wallet user cancelled the signature. |
| `payment submitted but server still returned 402` | The retry was still gated — usually an amount/recipient mismatch. |

## Examples

Runnable scripts live in [`examples/`](./examples): a zero-spend 402 discovery probe and a real env-gated paid call against the live three.ws Market Data API.

## License

Apache-2.0. See [LICENSE](./LICENSE).

<!-- three.ws:growth -->
## Support the project

If x402-fetch saves you time, **[star it on GitHub](https://github.com/nirholas/x402-fetch)**. Stars are how other developers and AI agents find the repositories worth trusting, and they cost you one click.

Know someone who would use it? [Post on X](https://twitter.com/intent/tweet?text=x402-fetch%3A%20Drop-in%20fetch%20wrapper%20that%20automatically%20pays%20x402%20payment%20challenges%20with%20USDC%20on%20Base&url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-fetch) · [Share on Bluesky](https://bsky.app/intent/compose?text=x402-fetch%3A%20Drop-in%20fetch%20wrapper%20that%20automatically%20pays%20x402%20payment%20challenges%20with%20USDC%20on%20Base%20https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-fetch) · [Share on LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-fetch) · [Submit to Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-fetch&t=x402-fetch%3A%20Drop-in%20fetch%20wrapper%20that%20automatically%20pays%20x402%20payment%20challenges%20with%20USDC%20on%20Base) · [Share on Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-fetch&title=x402-fetch%3A%20Drop-in%20fetch%20wrapper%20that%20automatically%20pays%20x402%20payment%20challenges%20with%20USDC%20on%20Base)

## Built for AI agents too

Coding agents and LLM tooling can read this repo directly: [AGENTS.md](./AGENTS.md), [llms.txt](./llms.txt), [llms-full.txt](./llms-full.txt). Point an agent at `https://github.com/nirholas/x402-fetch` and it has the context it needs.

## More from the same author

- [All repositories by nirholas](https://github.com/nirholas/nirholas#readme): the full catalog, grouped by topic
- [three.ws](https://three.ws): the platform for 3D AI agents with Solana wallets, a skill marketplace and x402 payments
- Questions or ideas: [open an issue](https://github.com/nirholas/x402-fetch/issues) or [start a discussion](https://github.com/nirholas/x402-fetch/discussions)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=nirholas/x402-fetch)](https://github.com/nirholas/x402-fetch/graphs/contributors)

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/x402-fetch&type=Date)](https://www.star-history.com/#nirholas/x402-fetch&Date)

<!-- /three.ws:growth -->

<!-- three.ws:ecosystem -->
## Part of three.ws

[three.ws](https://three.ws) is a platform for 3D AI agents with Solana wallets: avatars, a skill marketplace, x402 payments and more than seventy MCP servers. `@three-ws/x402-fetch` is one package from it.

- Documentation site: https://nirholas.github.io/x402-fetch/
- npm: https://www.npmjs.com/package/@three-ws/x402-fetch
- Canonical source: https://github.com/nirholas/three.ws (this repository is a generated mirror of `packages/x402-fetch`)
- Agent-readable summary: [llms.txt](./llms.txt) and [AGENTS.md](./AGENTS.md)
- Issues and ideas: https://github.com/nirholas/x402-fetch/issues
<!-- /three.ws:ecosystem -->
