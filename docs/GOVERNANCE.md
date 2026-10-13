# Governance Architecture & Privileged Role Specification

This document details the governance architecture, administrative roles, and privileged operational pathways across the Prism protocol.

---

## 1. Governance Recommendations

In production deployment on Monad:
- **Protocol Owner (`owner`)**: Must be configured as a multi-signature wallet (e.g., Safe with a minimum 3-of-5 threshold) combined with a minimum 48-hour Timelock controller. All protocol contracts implement OpenZeppelin's `Ownable2Step` to prevent accidental transfers to invalid or inaccessible addresses.
- **Protocol Guardian (`guardian`)**: A separate operational multi-sig (e.g., 2-of-3) designated for fast-response emergency controls. The guardian has pause authority only and can be rotated via a 2-step transfer initiated by the `owner`.

---

## 2. Privileged Roles and Capabilities

The protocol separates privileges across two distinct authorities: **Owner** and **Guardian**.

### 2.1 Privileged Function Registry

| Contract | Function | Caller | Impact / Purpose |
| :--- | :--- | :--- | :--- |
| `PrismVault` | `createEpoch(exDate, payDate)` | `owner` | Appends a new dividend epoch schedule (only before the vault is sealed). |
| `PrismVault` | `seal()` | `owner` | Permanently locks the epoch schedule and disallows future epoch additions. |
| `PrismVault` | `setDemoMode(false)` | `owner` | Permanently disables demo mode. Re-enabling is prohibited. |
| `PrismVault` | `transferGuardian(newGuardian)` | `owner` | Starts 2-step guardian role transfer. |
| `PrismVault` | `acceptGuardian()` | `pendingGuardian` | Finalizes guardian role transfer. |
| `PrismVault` | `pause()` | `guardian` or `owner` | Temporarily halts new deposits. |
| `PrismVault` | `unpause()` | `guardian` or `owner` | Resumes new deposits. |
| `PrismAuction` | `transferGuardian(newGuardian)` | `owner` | Starts 2-step guardian role transfer. |
| `PrismAuction` | `acceptGuardian()` | `pendingGuardian` | Finalizes guardian role transfer. |
| `PrismAuction` | `pause()` | `guardian` or `owner` | Temporarily halts new auction listings and bids. |
| `PrismAuction` | `unpause()` | `guardian` or `owner` | Resumes auction listings and bids. |
| `MockDividendSource` | `declareEvent(epochId, type, payout)` | `owner` | Declares dividend distribution parameters for an epoch (unlocked only). |
| `MockDividendSource` | `lockEvent(epochId)` | `owner` | Permanently locks event parameters, rendering the distribution immutable. |

---

## 3. Guarantees: What Privileged Roles CAN and CANNOT Do to User Funds

### What Governance CAN Do:
1. **Pause Inflows**: Governance can halt new `deposit()` calls in `PrismVault` and new `createAuction()` / `buy()` calls in `PrismAuction` to contain unforeseen external issues.
2. **Schedule Epochs (Prior to Sealing)**: The owner defines the expiration horizon of upcoming distributions before capital is accepted. Once sealed, no epochs can ever be added or modified.
3. **Declare Corporate Actions**: The dividend source owner provides corporate action declarations and must lock them before any secondary trading or funding can occur.

### What Governance CANNOT Do:
1. **CANNOT Trap User Collateral**: 
   - `recombine()` is **NEVER pausable**. Users can always merge 1 PT + 1 EC per live epoch to retrieve underlying stock collateral.
   - `redeemPrincipal()` is **NEVER pausable**. After all epochs have settled or grace periods have elapsed, holders can redeem 100% of underlying stock.
2. **CANNOT Trap Unclaimed Dividends**:
   - `claim()` is **NEVER pausable**. Once an epoch is funded with USDC, coupon holders can claim their pro-rata distributions at any time.
3. **CANNOT Trap Escrowed Auction Inventory**:
   - `cancel()` in `PrismAuction` is **NEVER pausable**. Sellers can withdraw unsold inventory at any time, even while the contract is paused.
4. **CANNOT Alter Funded Dividends or Divert Payouts**:
   - Once an event is locked in `DividendSource`, `declareEvent()` permanently reverts with `EventIsLocked`. The owner cannot alter payout per share or action type after secondary trading begins or after funding.
5. **CANNOT Seize Collateral**:
   - There are no admin withdraw, upgradeable proxy backdoors, or fee extraction mechanisms on vault stock collateral or funded USDC.
