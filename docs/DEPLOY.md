# Monad Testnet Deployment Guide

This document provides exact, reproducible instructions for deploying and verifying the Prism protocol on **Monad Testnet**.

---

## 1. Network Parameters

| Parameter | Value |
|---|---|
| **Network Name** | Monad Testnet |
| **Chain ID** | `10143` |
| **RPC URL** | `https://testnet-rpc.monad.xyz` |
| **Currency Symbol** | `MON` |
| **Block Explorer** | `https://testnet.monadexplorer.com` |

---

## 2. Prerequisites

1. **Foundry** installed (`forge`, `cast`):
   ```bash
   forge --version
   ```
2. **Funded Deployer Wallet**:
   - Ensure the deployer account has testnet `MON` for gas (via the Monad testnet faucet).
3. **Environment Configuration**:
   Create or update `.env` in the repository root:
   ```bash
   cp .env.example .env
   ```
   Add your private key (never commit `.env`):
   ```env
   PRIVATE_KEY=0x...your_hex_encoded_private_key...
   RPC_URL=https://testnet-rpc.monad.xyz
   ```

---

## 3. Deployment Procedure

### Step 3.1: Dry-Run Simulation (No Gas Spent)
Simulate the deployment locally against the live Monad testnet state:
```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet-rpc.monad.xyz \
  -vvvv
```

Verify that:
- `MockStock`, `MockUSDC`, and `MockDividendSource` deploy cleanly.
- `PrismVault` deploys with `demoMode = true`.
- 4 quarterly epochs are created.
- `PrismVault.seal()` executes successfully.
- 4 quarterly corporate actions are declared and locked via `MockDividendSource`.
- Approvals for `PrismAuction` succeed.

### Step 3.2: Broadcast to Monad Testnet
Execute the on-chain broadcast:
```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  -vvvv
```

The script automatically generates and writes all contract addresses directly into:
```
deployments/monad-testnet.json
```

---

## 4. Contract Verification

To verify the deployed contracts on the Monad testnet block explorer, run:

```bash
# Verify MockStock
forge verify-contract <MOCK_STOCK_ADDRESS> contracts/MockStock.sol:MockStock \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify

# Verify MockUSDC
forge verify-contract <MOCK_USDC_ADDRESS> contracts/MockUSDC.sol:MockUSDC \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify

# Verify MockDividendSource
forge verify-contract <MOCK_DIVIDEND_SOURCE_ADDRESS> contracts/MockDividendSource.sol:MockDividendSource \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify

# Verify PrismVault (Constructor args: stock, usdc, dividendSource, demoMode)
forge verify-contract <PRISM_VAULT_ADDRESS> contracts/PrismVault.sol:PrismVault \
  --constructor-args $(cast abi-encode "constructor(address,address,address,bool)" <MOCK_STOCK_ADDRESS> <MOCK_USDC_ADDRESS> <MOCK_DIVIDEND_SOURCE_ADDRESS> true) \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify

# Verify PrismAuction (Constructor args: epochCoupon, usdc, vault)
forge verify-contract <PRISM_AUCTION_ADDRESS> contracts/PrismAuction.sol:PrismAuction \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" <EPOCH_COUPON_ADDRESS> <MOCK_USDC_ADDRESS> <PRISM_VAULT_ADDRESS>) \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify
```

---

## 5. Deployment Record & Address Manifest

Paste your verified Monad Testnet contract addresses below for permanent documentation:

```json
{
  "chainId": 10143,
  "contracts": {
    "MockStock": "",
    "MockUSDC": "",
    "MockDividendSource": "",
    "PrismVault": "",
    "PrincipalToken": "",
    "EpochCoupon": "",
    "PrismAuction": ""
  }
}
```

| Contract | Address on Monad Testnet | Explorer Link |
|---|---|---|
| **MockStock** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **MockUSDC** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **MockDividendSource** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **PrismVault** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **PrincipalToken** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **EpochCoupon** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |
| **PrismAuction** | `0x...` | [View Explorer](https://testnet.monadexplorer.com/address/0x...) |

---

## 6. Synchronizing the Web Frontend

Once deployed, copy or confirm that `deployments/monad-testnet.json` is updated. The web frontend automatically detects live non-zero addresses in `web/src/config/deployments.ts` and transitions the UI badge from `"TESTNET — NOT YET DEPLOYED"` to `"LIVE ON MONAD"`.
