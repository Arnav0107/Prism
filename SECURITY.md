# Security Policy & Disclosures

## Status: Unaudited Research Software

The Prism protocol contracts and web application are experimental prototypes developed for the Monad Metropolis Hackathon.

> **Warning**: These contracts have **NOT** been audited by an independent commercial smart contract security auditing firm. They are provided "as-is" without warranty of any kind. Do not commit production capital or real funds to these contracts.

---

## Automated Verification & Test Coverage Summary

The protocol has undergone comprehensive multi-layered automated verification:
- **73 Foundry tests** across 6 suites (`PrismVault.t.sol`, `PrismAuction.t.sol`, `Regression.t.sol`, `ReAudit.t.sol`, `Invariants.t.sol`, `CoverageExpansion.t.sol`), all passing 100%.
- **Stateful Invariant Fuzzing**: 7 system invariants executed across 12,800 calls per run fuzzing user interactions and privileged owner actions.
- **Test Coverage**:
  - `PrismVault.sol`: **100.00% Line Coverage (154/154)**, **100.00% Branch Coverage (49/49)**.
  - `PrismAuction.sol`: **99.09% Line Coverage (109/110)**, **96.77% Branch Coverage (30/31)**.
- **Static Analysis**: Slither analysis triaged and documented in `docs/STATIC_ANALYSIS.md` with zero critical unmitigated vulnerabilities.
- **Threat Model**: Complete actor, asset, and residual risk matrix documented in `docs/THREAT_MODEL.md`.
- **Governance Architecture**: 2-step multisig and timelock recommendations documented in `docs/GOVERNANCE.md`.

---

## Known Limitations, Robustness Hardening & Security Assumptions

### 1. Centralized Protocol Administration & Pausability
- `PrismVault`, `MockDividendSource`, and `PrismAuction` inherit OpenZeppelin `Ownable2Step`.
- **Pausability Without Trapping Funds**: A separate `guardian` role (settable via 2-step transfer by owner) can pause new entries (`deposit`, `createAuction`, `buy`). Crucially, **user capital exits (`recombine`, `redeemPrincipal`, `claim`, `cancel`, `fundEpoch`) are strictly non-pausable**. Users can always retrieve their underlying capital or cancel active orders even during emergency pauses.
- For non-demo deployments, ownership must be assigned to a multisig threshold wallet (e.g., Safe 3/5) with a timelock controller. See `docs/GOVERNANCE.md`.

### 2. Dividend Event Lock (R2 Mitigation)
- Auctions cannot trade against changeable dividends. `PrismAuction.createAuction` and `buy` strictly require that the dividend source event for the epoch is declared AND locked (`DividendNotLocked(epochId)`). Re-declaration of locked corporate action events reverts.

### 3. Sybil Wash Trading & Informational VWAP (R1 Mitigation)
- Direct `buyer == seller` self-trading is blocked with `SelfTrade()`.
- **Limitation**: Off-chain or multi-wallet sybil wash trading cannot be prevented purely on-chain. The Volume-Weighted Average Price (VWAP) is strictly **informational** and must never be consumed as a settlement or liquidation price oracle by external DeFi protocols. All "anti-wash" claims have been removed.

### 4. Unfunded Dividends & Default Visibility (R4 Mitigation)
- If a corporate dividend epoch passes its ex-date unfunded, a 30-day grace period (`FUNDING_GRACE = 30 days`) is observed.
- If the grace period expires without funding, the epoch defaults. When `redeemPrincipal` or `recombine` proceeds past an unfunded epoch after grace, the protocol emits `FundingDefaulted(epochId)` once, and `fundingStatus` reports `isDefaulted = true`.
- **Limitation**: If an issuer defaults on dividend payment, coupons yield zero USDC. However, principal collateral is preserved and redeemable for the underlying stock.

### 5. Collateral Integrity & Shortfall Prevention (M3 Mitigation)
- At the start of `deposit`, `recombine`, and `redeemPrincipal`, the vault verifies `mockStock.balanceOf(address(this)) >= principalToken.totalSupply()`, reverting with `CollateralShortfall()` if any negative rebase or deficit occurred.
- On deposits, exact balance deltas are verified (`UnsupportedCollateral()`).
- **Limitation**: Fee-on-transfer, negative-rebasing, positive-rebasing, and multiplier tokens are explicitly **unsupported**.

### 6. Auction Input Boundaries (R6 Mitigation)
- Dutch auction decay durations are strictly capped to 30 days, cannot extend past the epoch's ex-dividend date (`AuctionExtendsPastExDate()`), and `startPrice` is bounded to `type(uint128).max` (`InvalidPrice()`).

---

## Reporting Vulnerabilities

If you discover a security vulnerability within the Prism repository, please contact the development team directly at security@prism.finance or open a private advisory on GitHub. Please do not publish security vulnerabilities publicly until they have been reviewed and mitigated.
