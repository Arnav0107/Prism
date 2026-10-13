# Prism Local Development Guide

This guide walks through starting a local development environment, deploying the Prism contracts to a local Anvil node (Chain ID 31337), and testing the bifurcation (split) and recombine workflows in the Prism web application.

---

## 1. Prerequisites

- **Foundry** (`anvil`, `forge`, `cast`): installed and available in your PATH or `$HOME/.foundry/bin`.
- **Node.js** (v18+ or v20+) and **npm**.

---

## 2. One-Command Setup & Deployment

### Step A: Start Anvil & Deploy Contracts

Run the one-command deployment script from the project root:

**On Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-local.ps1
```

**On Linux / macOS (Bash):**
```bash
./scripts/deploy-local.sh
```

**What this script does automatically:**
1. Checks if Anvil is already running on `http://127.0.0.1:8545` (`--chain-id 31337`). If not, it launches Anvil in the background.
2. Broadcasts `script/Deploy.s.sol:DeployScript` using Anvil's public default test account (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`).
3. Mints initial test balances (1,000,000 mSTOCK and 1,000,000 mUSDC) to the deployer account.
4. Parses broadcast artifacts and writes all deployed addresses to `web/src/chain/deployments.local.json`.
5. Extracts updated ABIs into `web/src/chain/abi/`.

---

## 3. Launch the Web Application

In a new terminal window:

```bash
cd web
npm install   # If not already installed
npm run dev
```

Open your browser to:
[http://localhost:5173/#/app](http://localhost:5173/#/app)

---

## 4. End-to-End Walkthrough & Verification

Follow this exact test sequence to verify functionality:

### 1. Initial State & Wallet Bar
- Observe the top-left network chip: **`ANVIL (31337)`** with a **green dot**.
- Reads work automatically without connecting a browser extension wallet via the public RPC client (`http://127.0.0.1:8545`).
- Ensure the **ACTOR** dropdown is set to **`Deployer (Treasury) 0xf39F…2266`**.
- In the top-right balance indicator, verify the loaded balances:
  - `mSTOCK: 1,000,000.00`
  - `mUSDC: 1,000,000.00`
  - `PPT: 0.00`
  - `EC: 0.00`

### 2. Deposit & Bifurcate (Split Equity)
- In the **ACTION 01: Deposit & Strip Equity** panel:
  - Notice `AVAILABLE: 1,000,000.00`.
  - Enter `10` in the amount input.
  - Notice the **MINTING OUTCOME** shows `+10 PT` and **COUPON OUTCOME** shows `+10 EC (for Epochs 1..4)`.
  - Click **APPROVE mSTOCK** (approves the vault allowance).
  - Once confirmed, click **DEPOSIT & BIFURCATE**.
- After block inclusion:
  - Deployer balance updates to:
    - `mSTOCK: 999,990.00`
    - `PPT: 10.00`
    - `EC: 40.00` (10 per each of the 4 live epochs)
  - Under **INVENTORY**, observe 10 PT-STOCK and 10 EC for each epoch.

### 3. Recombine Package
- In the **ACTION 02: Recombine Package** panel:
  - Observe `PT HELD: 10.00`.
  - Enter `1` in the amount input.
  - Verify that the recombine button is active: **`RECOMBINE & UNLOCK SHARE`**.
  - Click **RECOMBINE & UNLOCK SHARE**.
- After block inclusion:
  - 1 PT and 1 EC for each unexpired epoch are burned.
  - 1 mSTOCK share is reconstituted and returned to the deployer.
  - Balances update to:
    - `mSTOCK: 999,991.00`
    - `PPT: 9.00`
    - `EC: 36.00` (9 per live epoch)

### 4. Faucet Verification
- In the Deposit card, locate the **`+ FAUCET (MINT 100)`** button in the amount header.
- Notice it renders cleanly inline next to `AVAILABLE: ...` without overlapping or colliding with adjacent columns at any screen resolution (360px to 1920px).
- Click **`+ FAUCET (MINT 100)`**.
- Once confirmed, the deployer's `mSTOCK` balance increases by exactly +100.

---

## 5. Stale Address & Restarted Anvil Handling

If the local Anvil node is restarted without re-running the deploy script:
1. The app detects that configured addresses have no active bytecode (`0x`).
2. The network chip dot turns **red** with tooltip: `"Contracts not found on this chain — run scripts/deploy-local"`.
3. Balance indicators display `--` (instead of stuck `...` or incorrect `0.00`).
4. An alert banner appears across the interface:
   > ⚠ *Contracts not found on this chain — run scripts/deploy-local (or restart Anvil)* `[RETRY]`
5. Deposit and Recombine action buttons display **`CONTRACTS NOT DEPLOYED`** (disabled).
6. Run `powershell -ExecutionPolicy Bypass -File scripts/deploy-local.ps1` (or `./scripts/deploy-local.sh`) and click **`RETRY`** to immediately restore the live connected state.

---

## 6. Running Tests

### Contract Tests (Foundry)
```bash
forge test
```

### Web Frontend Unit Tests & Build (Vitest & Vite)
```bash
cd web
npm test
npm run build
```
