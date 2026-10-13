# Threat Model — Prism Protocol

This document outlines the security threat model, asset categorization, threat actor capabilities, architectural mitigations, and residual risks for the Prism protocol on Monad.

---

## 1. Threat Matrix

| Asset | Threat Actor | Threat / Capability | Mitigation | Residual Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Underlying Collateral (MockStock)** | Malicious / Compromised Protocol Owner | Attempt to drain collateral or front-run user redemptions by injecting epochs. | Epoch schedule is permanently sealed before deposits (`isSealed`). Inflows can be paused, but user redemption (`recombine`, `redeemPrincipal`) is strictly non-pausable. No admin withdrawal function exists. | **Single-Owner Trust**: If keys are compromised before deployment sealing, epoch definitions could be maliciously configured. Requires multi-sig + timelock governance. |
| **Underlying Collateral (MockStock)** | External Token Contract / Non-standard Token | Negative rebase or fee-on-transfer token decreases vault collateral below `principalToken.totalSupply()`. | Strict checks in `deposit`, `recombine`, and `redeemPrincipal`: `mockStock.balanceOf(vault) >= principalToken.totalSupply()`, else reverts `CollateralShortfall()`. Strict balance delta check on transfer (`UnsupportedCollateral`). | **Unsupported Collateral**: Positive rebasing, negative rebasing, and multiplier tokens are explicitly unsupported. Only standard 18-decimal non-rebasing ERC-20 tokens are supported. |
| **Dividend Funds (MockUSDC)** | Unfunded Corporate Issuer / Delinquent Funder | Dividend epoch passes `exDate` without funding, attempting to trap user principal indefinitely. | 30-day grace period (`FUNDING_GRACE = 30 days`). Once grace period lapses without funding, epoch is marked as defaulted (`FundingDefaulted` event emitted) and principal redemption unblocks. | **Unfunded Dividends**: If an issuer fails to fund USDC payouts, coupon vouchers yield zero dividend return. Principal collateral is preserved and returned to holders, but coupon speculative value is lost. |
| **Secondary Market Pricing (VWAP)** | Sybil Trader / Wash Trader | Self-trading or trading between multiple Sybil addresses to artificially manipulate the Volume-Weighted Average Price (VWAP). | Direct `buyer == seller` self-trading reverts with `SelfTrade()`. Contract and UI explicitly designate VWAP as purely **informational**. VWAP is never used as an on-chain oracle for liquidations or settlement. | **Sybil Wash Trading**: Off-chain or multi-wallet wash trading cannot be prevented purely on-chain. VWAP must not be consumed by external DeFi protocols as a price feed. |
| **Dividend Declaration** | Malicious / Volatile Oracle Source | Changing the dividend payout per share after secondary auctions have commenced (bait-and-switch). | `PrismAuction` strictly requires dividend events to be declared AND permanently locked (`DividendNotLocked(epochId)`) before any auction can be created or executed. Re-declaration of locked events reverts. | **Mock Oracle Dependency**: In testnet, `MockDividendSource` simulates corporate action announcements. In production, reliance shifts to external oracle providers or canonical corporate action publishers. |
| **Secondary Auction Inventory** | Exploiter / Malicious Buyer | Rounding exploits on dust fills or zero-cost token acquisition. | Minimum fill threshold (`MIN_FILL = 1e15`). All partial fill cost calculations use `Math.mulDiv(..., Math.Rounding.Ceil)`. Bounded duration (max 30 days) and price (`type(uint128).max`). | **Market Liquidity Risk**: Low secondary market liquidity may result in Dutch auction prices decaying to `floorPrice` without fills. |
| **System Integrity & Deployment** | Protocol Users / Integrators | Interacting with unverified or unaudited test contracts. | Comprehensive invariant testing (12,800 stateful fuzz calls per run), 100% line coverage on Vault, 99.09% line coverage on Auction, Slither static analysis triage. | **Unaudited Status**: Protocol has undergone extensive internal automated auditing and regression verification, but has not completed formal third-party commercial security audits. Deployment is intended for testnet only. |

---

## 2. Inherent Assumptions and Out-of-Scope Risks

1. **Monad Testnet Environment**: Deployed to Monad Testnet (Chain ID 10143) for demonstration and hackathon evaluation. No real economic value or production assets are secured.
2. **Deterministic Time**: While block timestamp manipulation is theoretically bounded to seconds on Monad, protocol time horizons operate on multi-day granularity (30 to 400 days), rendering validator timestamp drift immaterial.
3. **Collateral Standards**: The protocol explicitly requires vanilla ERC-20 tokens with 18 decimals and deterministic balances. Rebase tokens, transfer fees, and deflationary assets are excluded by design.
