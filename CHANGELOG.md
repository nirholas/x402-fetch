# Changelog

All notable changes to `@three-ws/x402-fetch` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-06-30

### Added
- Comprehensive documentation: a full README (quickstart, how-it-works sequence
  diagram, complete API reference, wallet/signer guide, configuration reference,
  supported-networks table, error handling, security notes, and FAQ), plus
  `docs/api.md` (exhaustive reference) and `docs/examples.md` (8 runnable examples).
- `CONTRIBUTING.md`.

### Changed
- Published as `@three-ws/x402-fetch`. The library is standalone and host-neutral —
  it pays the `accepts[]` advertised by any x402 (HTTP 402) endpoint, with no
  assumption about which server issued the challenge.
- Documentation and examples now reference a generic endpoint rather than any
  specific hosted service.

### Notes
- No runtime behavior changed in this release; the buyer flow, EIP-3009 (USDC on
  Base) signing, and `maxPaymentUsd` cap are unchanged.

[1.0.1]: https://github.com/nirholas/x402-fetch/releases/tag/v1.0.1
