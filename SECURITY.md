# Security Policy & Disclosures

## Status: Unaudited Research Software

The Prism protocol contracts and web application are experimental prototypes developed for the Monad Metropolis Hackathon.

> **Warning**: These contracts have **NOT** been audited by an independent smart contract security auditing firm. They are provided "as-is" without warranty of any kind. Do not commit production capital or real funds to these contracts.

---

## Known Limitations & Security Assumptions

1. **Centralized Protocol Administration**:
   - `PrismVault` and `MockDividendSource` inherit OpenZeppelin `Ownable2Step`.
   - The contract deployer/owner possesses administrative authority to create epochs (prior to sealing), permanently disable demo mode, and declare corporate actions.
   - For non-demo deployments, ownership must be assigned to a multisig threshold wallet (e.g. Safe 3/5) or a timelock controller.

2. **Simulated Corporate Actions & Dividend Feeds**:
   - Dividends and corporate actions are provided via `MockDividendSource.sol`.
   - The contract relies on permissionless funding and a 30-day funding grace period (`FUNDING_GRACE = 30 days`) during which principal exits are blocked if an epoch passes its ex-date unfunded.
   - Production deployments must integrate an institutional custodian push model or verified DTCC corporate action oracle feeds (Chainlink Functions, Pyth).

3. **Collateral Limitations**:
   - The vault enforces exact 1:1 balance deltas on deposit (`UnsupportedCollateral()`).
   - Rebasing tokens (e.g. stETH, AMPL), fee-on-transfer tokens, and balance-multiplier tokens cannot be used directly as collateral.
   - Non-standard tokens must be wrapped in an ERC-4626 or custom collateral adapter before deposit.

4. **Dutch Auction Price Decay & MEV**:
   - Dutch auctions decay linearly against `block.timestamp`. On low-block-time chains like Monad (10,000 TPS, 1s blocks), time manipulation risk is minimal, but transactions remain subject to MEV searcher frontrunning if adequate slippage limits (`maxPrice`) are not specified.

---

## Reporting Vulnerabilities

If you discover a security vulnerability within the Prism repository, please contact the development team directly at security@prism.finance or open a private advisory on GitHub. Please do not publish security vulnerabilities publicly until they have been reviewed and mitigated.
