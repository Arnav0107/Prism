# Static Analysis Report — Slither

This report documents the static analysis findings for the Prism smart contracts using **Slither 0.11.6** (Crytic/Trail of Bits), with every finding triaged as **Fixed**, **False Positive**, or **Accepted Risk**.

---

## 1. Summary of Analysis

- **Target Codebase**: `contracts/` (`PrismVault.sol`, `PrismAuction.sol`, `PrincipalToken.sol`, `EpochCoupon.sol`, `IDividendSource.sol`, `Mock*.sol`)
- **Analyzed Contracts**: 39 contracts (including OpenZeppelin dependencies) with 102 detectors.
- **Critical / High Severity Findings in Core Protocol**: **0**

---

## 2. Findings Triage Matrix

| Detector | Contract / Location | Severity | Status | Triage Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `reentrancy-benign` | `PrismAuction._createAuction` | Low | **Fixed** | Reordered auction storage updates and active auction counter increments before the external `safeTransferFrom` call, strictly following Checks-Effects-Interactions (CEI). |
| `unused-return` | `PrismAuction.buy` | Medium | **False Positive** | Return values `actionType` and `usdcPerShare` from `getEvent()` are deliberately omitted because buy validation only requires dividend declaration and immutability lock. |
| `unused-return` | `PrismAuction._createAuction` | Medium | **False Positive** | Same as above; auction creation checks that corporate action is declared and locked (`declared && locked`), without needing payout math. |
| `calls-loop` | `PrismVault.deposit` | Low | **Accepted Risk** | Loops over vault epochs bounded by `MAX_EPOCHS = 16`. Only calls trusted internal `epochCoupon.mint`. |
| `calls-loop` | `PrismVault.recombine` | Low | **Accepted Risk** | Loops over vault epochs bounded by `MAX_EPOCHS = 16`. Only calls trusted internal `epochCoupon.burn`. |
| `calls-loop` | `PrismAuction.createBatchAuctions` | Low | **Accepted Risk** | Iterates over user-specified arrays; gas is paid by caller and bounded by block gas limits. |
| `costly-loop` | `PrismAuction.createBatchAuctions` | Info | **Accepted Risk** | State updates inside loop are necessary to register each auction ID in batch mode. |
| `timestamp` | `PrismVault` & `PrismAuction` | Low | **Accepted Risk** | Protocol relies on block timestamps for epoch exDates, grace periods (30 days), and Dutch auction linear decay. Minor validator drift (< 15s) has negligible impact on multi-day horizons. |
| `cyclomatic-complexity` | `PrismAuction.buy` | Info | **Accepted Risk** | High cyclomatic complexity (12) is intentional due to defense-in-depth safety checks (self-trade check, minimum fill, pause checks, liquidity checks, exDate bounds, dividend lock checks, slippage guard). |
| `pragma` / `solc-version` | OpenZeppelin library imports | Info | **False Positive** | OpenZeppelin contracts use `^0.8.20` while protocol contracts use `^0.8.24`. Compiled under exact solc `0.8.24`. |
| `low-level-calls` | `lib/openzeppelin-contracts/.../Address.sol` | Low | **False Positive** | Standard OpenZeppelin v5 library utility implementations. |
| `unindexed-event-address` | `lib/openzeppelin-contracts/.../Pausable.sol` | Info | **False Positive** | Upstream OpenZeppelin `Paused(address)` and `Unpaused(address)` events. |

---

## 3. Tool Execution Details

```bash
$ slither . --checklist
# Result: 0 High, 0 Critical in contracts/
# 1 Reentrancy finding remediated via CEI
# 2 Unused return tuples verified as safe partial destructuring
```
