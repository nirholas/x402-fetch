# Examples — `@nirholas/x402-fetch`

Runnable examples. Each block is complete — copy it into a `.mjs` file (or a module-type project) and run with Node ≥ 18. Replace endpoint URLs with a real x402 endpoint and fund the wallet with USDC on Base.

> All examples assume `WALLET_PRIVATE_KEY` is set to a `0x`-prefixed 32-byte key for a Base wallet holding USDC.

---

## 1. Minimal Node script

A single paid `GET`. The 402, signature, and retry are invisible to your code.

```js
// pay.mjs — run: WALLET_PRIVATE_KEY=0x… node pay.mjs
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

const wallet = privateKeyToWallet(process.env.WALLET_PRIVATE_KEY);
console.log('Paying from', wallet.address);

const pay = withX402(wallet, { maxPaymentUsd: 0.10 });

const res = await pay('https://api.example.com/paid');
if (!res.ok) {
  console.error('Request failed:', res.status, await res.text());
  process.exit(1);
}
console.log(await res.json());
```

---

## 2. Auditing spend with `onPayment`

`onPayment` fires once per payment, just before the signature, with the USD amount and recipient. Use it to log, meter, or enforce a running budget.

```js
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

let spent = 0;
const BUDGET = 1.00; // total USD across the whole run

const pay = withX402(privateKeyToWallet(process.env.WALLET_PRIVATE_KEY), {
  maxPaymentUsd: 0.25, // per-request cap
  onPayment: ({ amount, to, requestUrl }) => {
    spent += amount;
    console.log(`paying $${amount.toFixed(4)} to ${to} for ${requestUrl} (total $${spent.toFixed(4)})`);
    if (spent > BUDGET) {
      throw new Error(`budget exceeded: $${spent.toFixed(4)} > $${BUDGET.toFixed(4)}`);
    }
  },
});

const res = await pay('https://api.example.com/paid', { method: 'POST' });
console.log(await res.json());
```

`maxPaymentUsd` caps each individual call; the `onPayment` throw caps the cumulative spend. The throw aborts the in-flight request before its signature is produced.

---

## 3. Agent loop — call many paid endpoints in sequence

A typical autonomous-agent pattern: the same wrapped fetch reused across a tool loop, with per-call cost protection.

```js
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

const pay = withX402(privateKeyToWallet(process.env.WALLET_PRIVATE_KEY), {
  maxPaymentUsd: 0.05,
  onPayment: ({ amount, requestUrl }) =>
    console.log(`  [spend] $${amount.toFixed(4)} → ${requestUrl}`),
});

const tools = [
  { name: 'search', url: 'https://api.example.com/search?q=x402' },
  { name: 'summarize', url: 'https://api.example.com/summarize' },
  { name: 'translate', url: 'https://api.example.com/translate' },
];

for (const tool of tools) {
  try {
    const res = await pay(tool.url);
    const data = await res.json();
    console.log(`${tool.name}:`, data);
  } catch (err) {
    if (err.message.includes('exceeds maxPaymentUsd')) {
      console.warn(`skipping ${tool.name}: too expensive`);
      continue; // skip costly tools, keep the loop alive
    }
    throw err;
  }
}
```

---

## 4. viem integration

If your app already uses viem, pass a `LocalAccount` straight in — no key handling in this package, viem signs.

```js
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
const pay = withX402(account, { maxPaymentUsd: 0.10 });

const res = await pay('https://api.example.com/paid');
console.log(await res.json());
```

A viem `WalletClient` works too, as long as it exposes `account.address` and a `signTypedData` method.

---

## 5. Browser — MetaMask / EIP-1193

In the browser, pass the injected provider. The user approves each signature in their wallet.

```js
import { withX402 } from '@nirholas/x402-fetch';

if (!window.ethereum) throw new Error('No EIP-1193 wallet found');

const pay = withX402(window.ethereum, {
  maxPaymentUsd: 0.10,
  onPayment: ({ amount, to }) => console.log(`Approving $${amount} to ${to}`),
});

document.querySelector('#unlock').addEventListener('click', async () => {
  try {
    const res = await pay('/api/premium');
    document.querySelector('#out').textContent = await res.text();
  } catch (err) {
    if (err.message.includes('user rejected payment')) {
      alert('Payment cancelled.');
    } else {
      alert('Could not unlock: ' + err.message);
    }
  }
});
```

---

## 6. Full error handling

Branch on every documented failure.

```js
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

const pay = withX402(privateKeyToWallet(process.env.WALLET_PRIVATE_KEY), {
  maxPaymentUsd: 0.10,
  timeout: 20000,
});

async function callPaid(url, init) {
  try {
    const res = await pay(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    const m = err.message || String(err);
    if (m.includes('exceeds maxPaymentUsd')) {
      console.error('Declined: above your per-request limit.');
    } else if (m.includes('no supported network/asset')) {
      console.error('Endpoint wants an unsupported chain/asset (not EIP-3009 USDC).');
    } else if (m.includes('user rejected payment')) {
      console.error('User cancelled the signature.');
    } else if (m.includes('still returned 402')) {
      console.error('Paid but still gated — check funding and the facilitator.');
    } else if (m.includes('timed out')) {
      console.error('Signing timed out — check the wallet/provider.');
    } else if (m.includes('no parseable payment challenge')) {
      console.error('Server is not x402-compliant.');
    } else {
      throw err; // unexpected — let it bubble
    }
    return null;
  }
}

const data = await callPaid('https://api.example.com/paid', { method: 'POST' });
if (data) console.log(data);
```

---

## 7. Upstream-compatible shape

Dropping into existing `x402-fetch` code? Use the alias.

```js
import { wrapFetchWithPayment } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

const pay = wrapFetchWithPayment(
  fetch,
  privateKeyToWallet(process.env.WALLET_PRIVATE_KEY),
  { maxPaymentUsd: 0.25 },
);

const res = await pay('https://api.example.com/paid');
console.log(await res.json());
```

---

## 8. Preferring a specific network

When an endpoint offers payment on several chains, pin the one you want with `network` (CAIP-2). Otherwise Base mainnet wins by default.

```js
import { withX402 } from '@nirholas/x402-fetch';
import { privateKeyToWallet } from '@nirholas/x402-fetch/wallet';

const pay = withX402(privateKeyToWallet(process.env.WALLET_PRIVATE_KEY), {
  network: 'eip155:8453', // Base mainnet (the default preference, made explicit)
});

const res = await pay('https://api.example.com/paid');
console.log(await res.json());
```
