# Monad Testnet Deployment & Operations Guide

This guide provides end-to-end, reproducible instructions for compiling, testing, simulating, deploying, verifying, and hosting the **Prism Protocol** on **Monad Testnet** (Chain ID `10143`).

---

## 1. Network Parameters

| Parameter | Value |
|---|---|
| **Network Name** | Monad Testnet |
| **Chain ID** | `10143` |
| **RPC URL** | `https://testnet-rpc.monad.xyz` |
| **Currency Symbol** | `MON` |
| **Block Explorer** | [MonadVision](https://testnet.monadvision.com) |
| **Sourcify Verifier API** | `https://sourcify-api-monad.blockvision.org/` |
| **Testnet Faucets** | [testnet.monad.xyz](https://testnet.monad.xyz) &bull; [faucet.monad.xyz](https://faucet.monad.xyz) |

> [!NOTE]
> Monad is a high-performance Proof-of-Stake / MonadBFT blockchain. There is no proof-of-work mining; testnet funds must be obtained exclusively from official faucets.

---

## 2. Toolchain Prerequisites

### Monad Foundry Installation
Standard Foundry builds may lack chain configurations or optimizations for Monad. Install the dedicated Monad-compatible Foundry toolchain:

```bash
# 1. Download and run Foundry installer
curl -L https://foundry.category.xyz | bash

# 2. Update to Monad toolchain build
foundryup --network monad
```

> [!IMPORTANT]
> **Windows Users**: Run all Foundry commands (`forge`, `cast`, `anvil`) inside **WSL (Windows Subsystem for Linux)**. Native Windows PowerShell shells may experience path and compatibility issues with Bash-based scripts and specialized Foundry builds.

### Submodules and Compilation
Initialize Git submodules and compile all contracts:

```bash
# Initialize OpenZeppelin and Forge-std submodules
git submodule update --init --recursive

# Compile contracts
forge build
```

### Run Test Suite
Confirm that all unit, fuzz, invariant, and SVG rendering tests pass before initiating deployment:

```bash
forge test
```

---

## 3. Environment & Configuration

Create `.env` in the repository root (never commit or stage `.env`):

```bash
cp .env.example .env
```

Ensure the following variables are configured:

```env
RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=10143
PRIVATE_KEY=0x<YOUR_DEPLOYER_PRIVATE_KEY>
DEMO_MODE=true
# Optional: OWNER=0x<TARGET_GOVERNANCE_OWNER>
```

### Critical Note on `DEMO_MODE`
- `script/Deploy.s.sol` defaults `DEMO_MODE` to `true` **only** on local Anvil (`block.chainid == 31337`) and `false` on Monad Testnet (`10143`).
- For a live hackathon or interactive demo, **`DEMO_MODE=true` must be set explicitly** in `.env`.
- Without `DEMO_MODE=true`, `PrismVault.fundEpoch` will revert with `ExDateNotReached` until each epoch's scheduled `exDate` (which is 90 days after deployment for Epoch 1).
- Furthermore, `PrismVault.setDemoMode` is one-way: the contract owner can only permanently **disable** demo mode, never re-enable it.

---

## 4. Deployment Procedure

Deploying uses Foundry's script engine with a mandatory **two-stage workflow**: simulate first, then broadcast.

### Stage 1: Simulation (Dry-Run)
Run the script without `--broadcast` to simulate execution against the live Monad testnet state without spending gas or sending transactions:

```bash
set -a; source .env; set +a
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$RPC_URL" \
  -vvvv
```

Inspect the dry-run output:
- Verify that gas estimations and estimated MON required do not exceed your wallet's available testnet balance.
- Verify that all step executions (vault initialization, epoch creation, token minting, secondary series creation via factory) succeed without reverts.

### Stage 2: Broadcast to Monad Testnet
Once the simulation succeeds and required gas is verified:

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvvv
```

> [!CAUTION]
> **Failed Runs Do Not Resume!**
> If a broadcast fails partway through execution (e.g., due to an RPC drop or insufficient balance), **do NOT blindly re-run the broadcast script**. Re-running will deploy an entirely new set of contracts, wasting testnet MON.
> Instead, inspect `broadcast/Deploy.s.sol/10143/run-latest.json` to identify which transactions completed and determine the exact point of interruption.

Upon successful completion, the script automatically serializes all deployed addresses to:
```
deployments/monad-testnet.json
```

---

## 5. Deployment Manifest & Verification

The deployment script serializes all 9 core contracts into `deployments/monad-testnet.json`:

```json
{
  "chainId": 10143,
  "contracts": {
    "MockStock": "0x...",
    "MockUSDC": "0x...",
    "MockDividendSource": "0x...",
    "MockReferencePrice": "0x...",
    "PrismVault": "0x...",
    "PrincipalToken": "0x...",
    "EpochCoupon": "0x...",
    "PrismAuction": "0x...",
    "PrismFactory": "0x..."
  }
}
```

### Contract Verification via Sourcify
Verify each deployed contract on MonadVision using Sourcify and Monad's dedicated Sourcify endpoint:

```bash
VERIFIER_URL="https://sourcify-api-monad.blockvision.org/"

# 1. MockStock (no constructor args)
forge verify-contract <MOCK_STOCK_ADDR> contracts/MockStock.sol:MockStock \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 2. MockUSDC (no constructor args)
forge verify-contract <MOCK_USDC_ADDR> contracts/MockUSDC.sol:MockUSDC \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 3. MockDividendSource (no constructor args)
forge verify-contract <MOCK_DIV_SRC_ADDR> contracts/MockDividendSource.sol:MockDividendSource \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 4. MockReferencePrice (constructor: uint256 initialPrice = 100_000_000)
forge verify-contract <MOCK_REF_PRICE_ADDR> contracts/MockReferencePrice.sol:MockReferencePrice \
  --constructor-args $(cast abi-encode "constructor(uint256)" 100000000) \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 5. PrismVault (constructor: address stock, address usdc, address dividendSource, bool demoMode, bool inKindDividends)
forge verify-contract <PRISM_VAULT_ADDR> contracts/PrismVault.sol:PrismVault \
  --constructor-args $(cast abi-encode "constructor(address,address,address,bool,bool)" <MOCK_STOCK_ADDR> <MOCK_USDC_ADDR> <MOCK_DIV_SRC_ADDR> true false) \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 6. PrincipalToken (constructor: address vault)
forge verify-contract <PRINCIPAL_TOKEN_ADDR> contracts/PrincipalToken.sol:PrincipalToken \
  --constructor-args $(cast abi-encode "constructor(address)" <PRISM_VAULT_ADDR>) \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 7. EpochCoupon (constructor: address vault, string uri)
forge verify-contract <EPOCH_COUPON_ADDR> contracts/EpochCoupon.sol:EpochCoupon \
  --constructor-args $(cast abi-encode "constructor(address,string)" <PRISM_VAULT_ADDR> "") \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 8. PrismAuction (constructor: address epochCoupon, address mockUSDC, address prismVault)
forge verify-contract <PRISM_AUCTION_ADDR> contracts/PrismAuction.sol:PrismAuction \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" <EPOCH_COUPON_ADDR> <MOCK_USDC_ADDR> <PRISM_VAULT_ADDR>) \
  --verifier sourcify --verifier-url "$VERIFIER_URL"

# 9. PrismFactory (no constructor args)
forge verify-contract <PRISM_FACTORY_ADDR> contracts/PrismFactory.sol:PrismFactory \
  --verifier sourcify --verifier-url "$VERIFIER_URL"
```

---

## 6. Post-Deployment Smoke Test Checklist

Execute these read-only checks via `cast` to validate on-chain state:

1. **Vault Initialized with 4 Epochs**:
   ```bash
   cast call <PRISM_VAULT_ADDR> "epochCount()(uint256)" --rpc-url https://testnet-rpc.monad.xyz
   # Expected output: 4
   ```

2. **Demo Mode Active**:
   ```bash
   cast call <PRISM_VAULT_ADDR> "demoMode()(bool)" --rpc-url https://testnet-rpc.monad.xyz
   # Expected output: true
   ```

3. **Vault Sealed**:
   ```bash
   cast call <PRISM_VAULT_ADDR> "isSealed()(bool)" --rpc-url https://testnet-rpc.monad.xyz
   # Expected output: true
   ```

4. **On-Chain SVG Metadata Generation**:
   ```bash
   cast call <EPOCH_COUPON_ADDR> "uri(uint256)(string)" 1 --rpc-url https://testnet-rpc.monad.xyz
   # Expected output: data:application/json;base64,... containing valid Base64 JSON & embedded SVG
   ```

5. **Deployed Bytecode Verification**:
   ```bash
   cast code <PRISM_VAULT_ADDR> --rpc-url https://testnet-rpc.monad.xyz
   cast code <PRISM_AUCTION_ADDR> --rpc-url https://testnet-rpc.monad.xyz
   # Must return active non-empty hex bytecode (not 0x)
   ```

---

## 7. Frontend Build & Hosting (Vercel / Netlify)

### Commit Deployments First
The frontend evaluates `isDeployedOnMonad` at **build time** by importing `deployments/monad-testnet.json`. Before building or deploying to hosting providers, you **must commit** the populated `deployments/monad-testnet.json` file:

```bash
git add deployments/monad-testnet.json
git commit -m "chore: record monad testnet deployment addresses"
```

### Build Frontend
```bash
cd web
npm ci
npm run build
```
Verify that the output bundle in `web/dist/` references the Monad contract addresses and builds cleanly.

### Hosting Configuration
- **Platform**: Vercel or Netlify
- **Root Directory**: `web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Single Page App Routing**: `/* -> /index.html` (handled via `web/public/_redirects` or `vercel.json`)
