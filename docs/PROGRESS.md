# Implementation Progress — Prism Protocol

## Tier 0 Status: Complete & Verified (Green)
All 5 configuration and environment bugs from Tier 0 are resolved and verified:
1. `deployments/monad-testnet.json` reset to null addresses; `script/Deploy.s.sol` strictly writes to Monad testnet config on chain 10143 and local config on chain 31337, reverting on any other chain.
2. `isDeployedOnMonad` dynamically queries on-chain bytecode via a public Viem client against Monad RPC and renders "NOT YET DEPLOYED / UNVERIFIED" until verified.
3. Hardcoded private keys are removed from production pathways; Anvil burner accounts throw on any chain other than 31337; `.env.example` uses `0x<YOUR_KEY>`.
4. Deploy script reads `DEMO_MODE` from environment variables, defaulting to `true` on 31337 and `false` elsewhere.
5. The Portfolio table date handling bug is fixed by consuming `latestBlockTimestamp` from the RPC and handling milliseconds/seconds safely via `formatTimestampToDate`. Tested with 14 Vitest tests in `hardening2.test.ts`.
All tests pass (`73/73` Foundry tests, `49/49` Vitest tests, web build succeeds).

## Tier 1 Status: Complete & Verified (Green)
Tier 1 must-ship items are fully implemented, verified, and passing:
1. Lock-before-trade (R2) enforces `DividendNotLocked(epochId)` across single/batch auctions and buys.
2. Self-trading (R1) is blocked via `SelfTrade()`, and Sybil wash trading limitations are explicitly disclosed.
3. Zero-epoch vault sealing (R3) reverts `NoEpochs()`.
4. Collateral shortfall guard (M3) enforces `mockStock.balanceOf(vault) >= principalToken.totalSupply()` (`CollateralShortfall()`).
5. Net-of-withholding tax dividends (0–10000 bps) store gross `usdcPerShare` and compute net payout in vault, with UI displaying gross, tax withholding, and net columns; verified by 5 unit tests in `WithholdingTax.t.sol` (0%, 30%, 100%, and boundary reverts).
6. On-chain implied quarterly yield is calculated via `IReferencePrice` / `MockReferencePrice` and `PrismAuction.impliedQuarterlyYieldBps`, with staleness rejection past 1 day; the Dividend Curve UI loads on-chain reference price by default with typing override; verified by 5 tests in `ImpliedYield.t.sol`.
7. `Pausable` guardian role allows pausing only new deposits, auction creation, and buys, while capital exits (`recombine`, `redeemPrincipal`, `claim`, `cancel`, `fundEpoch`) remain non-pausable.
8. Auction duration (capped to 30 days), price (`<= type(uint128).max`), and ex-date boundary limits are enforced.
9. 2-step `OWNER` multisig governance flow is implemented in `Deploy.s.sol` and documented in `docs/GOVERNANCE.md`.
10. Stateful fuzz invariant testing asserts live coupon supply equality, USDC solvency, claim caps, locked dividend immutability, and stock redemption bounds across 12,800 fuzzed calls per run including owner administration.
11. Docs pass complete with target user framing, comparison table, xStocks/Ondo/Dinari real-world tokenized equity analysis, and threat matrix in `docs/THREAT_MODEL.md`.
12. CI workflow updated with formatting checks, fuzz runs, and npm audits; Slither findings triaged in `docs/STATIC_ANALYSIS.md`.
All tests pass (`83/83` Foundry tests across 8 suites, `49/49` Vitest tests, web build passes).
