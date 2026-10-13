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
