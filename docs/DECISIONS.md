# Architecture & Implementation Decisions — Prism Protocol

This document records key design and architecture decisions made during the final push for the Monad Metropolis Hackathon submission.

---

## Tier 0 Decisions
1. **Deployment Address Nullification**:
   - `deployments/monad-testnet.json` holds all zero-address values (`0x0000000000000000000000000000000000000000`) until real on-chain bytecode is verified.
2. **Chain Verification Gate**:
   - `Deploy.s.sol` strictly gates writes by chain ID: `10143` writes to `deployments/monad-testnet.json`, `31337` writes to `web/src/chain/deployments.local.json`. Any other chain ID reverts with `UnsupportedChainId(block.chainid)`.
3. **Burner Key Restriction**:
   - Anvil private keys are restricted to local test chain `31337`. `getDevAccounts` and `getDevWalletClient` immediately throw if called with any other chain ID.
4. **Timestamp Reference in Web UI**:
   - Portfolio calculations use `latestBlockTimestamp` queried directly from the RPC block header via Viem `getBlock()` instead of client system `Date.now()`.

---

## Tier 1 Decisions
1. **Withholding Tax Accounting**:
   - Extended `IDividendSource` and `MockDividendSource` with `withholdingBps` (0–10000). The event stores gross `usdcPerShare` and `withholdingBps`, while `PrismVault.fundEpoch` calculates net payout as `(gross * (10000 - withholdingBps)) / 10000`. Overloaded `declareEvent(epochId, actionType, usdcPerShare)` defaults to 0% withholding for backward compatibility.
2. **On-Chain Implied Yield View**:
   - Implemented `IReferencePrice` (`function price() returns (uint256 usdcPerShare, uint256 updatedAt)`) and `MockReferencePrice` with owner update functions. Added `PrismAuction.impliedQuarterlyYieldBps(epochId, referencePrice)` calculating `(vwap * 10000) / refPrice`. Bounded staleness to 1 day (`block.timestamp > updatedAt + 1 days` reverts `StaleReferencePrice`).
3. **Pausability Without Fund Trapping**:
   - `Pausable` guardian role pauses inflows (`deposit`, `createAuction`, `buy`). Capital redemptions (`recombine`, `redeemPrincipal`, `claim`, `cancel`, `fundEpoch`) are strictly non-pausable so users can never be trapped in paused contracts.
4. **Auction Safety Boundaries**:
   - Capped duration to 30 days (`MAX_AUCTION_DURATION = 30 days`), required `startPrice <= type(uint128).max`, and rejected auctions extending beyond the epoch's ex-dividend date (`AuctionExtendsPastExDate`).
