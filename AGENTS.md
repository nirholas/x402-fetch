# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`@three-ws/x402-fetch` v1.0.4. Drop-in fetch wrapper that automatically pays x402 payment challenges with USDC on Base

A JavaScript library. Import it from ESM.

## Use it

```bash
npm install @three-ws/x402-fetch
```

Full usage, tool list and configuration are in [README.md](README.md). Machine-readable summaries: [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt).

## Develop

```bash
npm install
npm test
```

Scripts:
- `npm run build`: `vite build`
- `npm run test`: `node --test tests/*.test.mjs`
- `npm run prepublishOnly`: `npm run build && npm test`

## Conventions

- ES modules, Node >=20.
- Read-only by default. Anything that signs, spends or sends must be an explicit, separately named tool or option, and must never be inferred from untrusted text (token names, memos, listings).
- Never commit credentials. Configuration comes from environment variables documented in the README.
- Keep changes small and covered by a test next to the code they change.

## Source of truth

This repository is a generated mirror of `packages` in https://github.com/nirholas/three.ws. Open issues here; send substantial changes as a pull request here or upstream.
