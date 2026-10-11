# Prism 🔺

> **Monad Metropolis — Track 1: Onchain Finance & Trading**  
> Splitting tokenized equity into pure capital appreciation (Principal Tokens) and recurring yield (Epoch Coupons).

---

## 1. Overview

**Prism** introduces a structural financial primitive for tokenized stocks on Monad. Inspired by traditional bond stripping and fixed-income STRIPS, Prism allows holders of tokenized shares (e.g. Backed, Ondo, Dinari, or xStock) to decompose a single equity asset into two tradeable legs:

1. **Principal Token (`PPT`)**: An ERC-20 token representing pure price exposure to the underlying stock collateral, redeemable for the underlying stock once all distribution epochs have concluded or recombined.
2. **Epoch Coupons (`EC`)**: An ERC-1155 multi-token collection (`id = epochId`) representing entitlement to quarterly dividend distributions. Secondary market participants can trade coupons independently to hedge dividend risk or speculate on dividend payouts.

---

## 2. Architecture & Contracts

All contracts reside in [`contracts/`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts):

| Contract | Standard | Description |
|---|---|---|
| [`MockStock.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/MockStock.sol) | ERC-20 (18 dec) | Test collateral representing tokenized equity (with public mint). |
| [`MockUSDC.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/MockUSDC.sol) | ERC-20 (6 dec) | Test stablecoin representing dividend cashflow distributions. |
| [`IDividendSource.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/IDividendSource.sol) | Interface | Declares corporate actions (`DIVIDEND`, `SPLIT`, `OTHER`) and payout rates. |
| [`MockDividendSource.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/MockDividendSource.sol) | Ownable | Owner-controlled corporate action registry with strict action typing. |
| [`PrincipalToken.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/PrincipalToken.sol) | ERC-20 (18 dec) | Capital exposure leg. Mint and burn restricted exclusively to `PrismVault`. |
| [`EpochCoupon.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/EpochCoupon.sol) | ERC-1155 (Supply) | Per-epoch dividend coupons (`id = epochId`). Mint/burn restricted to `PrismVault`. |
| [`PrismVault.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/PrismVault.sol) | Vault Core | Coordinates deposits, epoch funding, claims, recombines, and principal redemptions. |
| [`PrismAuction.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/PrismAuction.sol) | Marketplace | Dutch auction marketplace for continuous EpochCoupon price discovery and liquidity. |

---

## 3. Core Lifecycle & Mechanics

```
                         ┌──────────────┐
                         │  MockStock   │
                         └──────┬───────┘
                                │ deposit(amount)
                                ▼
                       ┌─────────────────┐
                       │   PrismVault    │
                       └───┬─────────┬───┘
                           │         │
          mints Principal  │         │ mints EpochCoupons
                           ▼         ▼
                  ┌─────────────┐   ┌──────────────────────────┐
                  │PrincipalToken│  │EpochCoupon (id = 1, 2, 3)│
                  └─────────────┘   └────────────┬─────────────┘
                                                 │
                   Secondary market transfer ────┤
                                                 ▼
                  fundEpoch(epochId) ──► claim(epochId, amount) ──► MockUSDC Payout
```

### 1. Epoch Creation (`createEpoch`)
- The vault admin registers distribution epochs with strict validation:
  - `exDate` must be in the future (`> block.timestamp`).
  - `payDate` must be on or after `exDate`.
  - Consecutive `exDate` values must be strictly increasing.

### 2. Deposit (`deposit`)
- A user locks `amount` of `MockStock` into `PrismVault`.
- The vault mints `amount` of `PrincipalToken` to the user.
- The vault mints `amount` of `EpochCoupon` **only for live epochs** (`!epoch.funded && epoch.exDate > block.timestamp`). Already funded or expired epochs are skipped to protect dividend solvency.

### 3. Corporate Action Safeguard, Demo Mode & Funding (`fundEpoch`)
- The dividend source declares an event for an epoch (`DIVIDEND`, `SPLIT`, or `OTHER`).
- When `fundEpoch(epochId)` is called:
  - If the action type is **not** `DIVIDEND` (e.g. a `SPLIT` or `OTHER`), the transaction **reverts** (`NonDividendActionType`).
  - **Demo Mode Safeguard**: The vault includes a `demoMode` flag (default `true` on testnet to allow immediate dividend demonstrations). **In production, `demoMode` MUST be toggled to `false` via `setDemoMode(false)`**, strictly preventing `fundEpoch` before the ex-dividend date (`ExDateNotReached`).
  - Calculates required payout: `(couponSupply(epochId) * amountPerShare) / 1e18`.
  - Pulls `MockUSDC` from caller into the vault.
  - Marks epoch state as `CLAIMABLE`.

### 4. Claiming Dividend Yield (`claim`)
- Any coupon holder (original depositor or secondary market buyer) calls `claim(epochId, amount)`.
- Burns the specified amount of `EpochCoupon`.
- Transfers pro-rata `MockUSDC` to the caller: `(amount * totalFundedUSDC) / fundedSupply`.

### 5. Recombination (`recombine`)
- At any time, a user can reconstitute their underlying `MockStock` collateral by calling `recombine(amount)`.
- Burns `amount` of `PrincipalToken`.
- Burns `amount` of `EpochCoupon` for all **live epochs** (`!epoch.funded && epoch.exDate > block.timestamp`).
- Epochs already funded or past `exDate` are **not required**.

### 6. Principal Redemption (`redeemPrincipal`)
- When no live distribution epochs remain (`hasFutureEpochs() == false`, i.e. all epochs are either funded or past `exDate`), the principal can be redeemed directly.
- Burns `amount` of `PrincipalToken` and returns `amount` of `MockStock` with zero coupon requirement.

---

## 4. Dividend Dutch Auction (`PrismAuction`)

The **Prism Dividend Dutch Auction** provides continuous on-chain price discovery and secondary liquidity for coupon holders wishing to sell upcoming dividend rights before the ex-dividend date.

### Core Auction Mechanics
- **Escrow**: Sellers deposit `EpochCoupon` into [`PrismAuction.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/PrismAuction.sol).
- **Linear Decay**: Prices decay continuously per second from `startPrice` to `floorPrice` over `duration` seconds:
  $$P(t) = \text{startPrice} - \frac{(\text{startPrice} - \text{floorPrice}) \times \Delta t}{\text{duration}}$$
  Once $t \ge \text{duration}$, the price clamps deterministically at `floorPrice`.
- **Immediate Settlement**: Buyers purchase coupons using `MockUSDC`. USDC is transferred directly from the buyer to the seller, and coupons are delivered to the buyer instantly.
- **Partial Fills**: Buyers can fill any fractional amount of an auction until the remaining balance reaches zero, which automatically closes the auction.
- **Slippage Protection**: Buyers pass `maxPrice` to ensure execution does not exceed their slippage threshold.
- **Batch Auctions**: Sellers can call `createBatchAuctions` to bundle multiple quarters into a single transaction (e.g. *"sell my next 4 quarterly dividends"*).
- **Zero Protocol Fees (MVP)**: This MVP implementation features **zero protocol fees**, providing 100% of proceeds directly to the seller.
- **Yield Curve Analytics**: `getEpochMarketData(epochId)` reports `(lastClearingPrice, volume, activeAuctionCount)` on-chain, allowing frontends to construct live dividend term-structure curves.

---

## 5. Mock vs. Real Disclaimer

> [!IMPORTANT]
> **Mock-vs-Real Architecture Transparency**
>
> In this implementation, dividend distributions and corporate actions originate from a controlled mock source ([`MockDividendSource.sol`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/contracts/MockDividendSource.sol)) controlled by an authorized operator.
>
> **Reasoning**: We have not verified that any live tokenized stock currently deployed in production exposes an on-chain dividend distribution multiplier, record-date oracle, or push-based corporate action stream. Most live tokenized equity issuers (such as Backed bTokens or Ondo tokenized products) either retain dividends within off-chain legal wrappers, use rebasing mechanisms, or perform off-chain bank remittances.
>
> In production on Monad, Prism would consume dividend distributions via an institutional oracle (such as Chainlink Functions, Pyth, or an API3 Airnode connected directly to DTCC / Bloomberg corporate action feeds) or an authorized broker-dealer custodian.

---

## 6. Invariants & Fuzz Testing

Prism enforces the following mathematical invariants, tested across 256 fuzzing runs:

1. **Collateral Conservation**:
   $$\text{MockStock.balanceOf}(\text{Vault}) \equiv \text{PrincipalToken.totalSupply}()$$
2. **Coupon Supply Integrity**:
   $$\forall e \in \text{Epochs}, \quad \text{EpochCoupon.totalSupply}(e) \equiv \text{Deposits}_{t < \text{exDate}} - \text{Burned}_{\text{claim}} - \text{Burned}_{\text{recombine}}$$
3. **Non-Dilutive Recombination**: Reconstituting 1.0 share requires burning 1.0 Principal Token alongside active coupons with zero slippage or loss, substantiated by `test_recombine_beforeExDate`, `test_recombine_afterExDate`, and `testFuzz_depositRecombineInvariants`.
4. **Auction Rounding Invariant**: In `PrismAuction.sol`, buyers never underpay for fractional coupons; `totalCost * 1e18 >= amount * price`, substantiated by `testFuzz_totalCostRoundingUp_andEscrowReconciliation`.
5. **Reentrancy Immunity**: All state-modifying functions enforce OpenZeppelin `nonReentrant` and follow the Checks-Effects-Interactions pattern.
6. **Token Isolation**: Minting and burning of both `PrincipalToken` and `EpochCoupon` are strictly locked behind immutable `onlyVault` access control.

---

## 7. Build, Test, & Gas Reports

### Prerequisites
- [Foundry](https://getfoundry.sh/) (`forge`, `cast`)
- Solidity `^0.8.24`

### Clone & Dependencies
```bash
git clone --recurse-submodules https://github.com/Arnav0107/Prism.git
cd Prism

# If cloned without --recurse-submodules:
git submodule update --init --recursive
# Or install directly via forge:
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0
```

### Build
```bash
forge build
```

### Run Tests
```bash
forge test -vv
```

### Run Invariant Fuzzing & Gas Report
```bash
forge test --gas-report
```

---

## 8. Deployment to Monad Testnet

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your `RPC_URL` and `PRIVATE_KEY`.
3. Execute the deployment script:
   ```bash
   forge script script/Deploy.s.sol:DeployScript \
     --rpc-url https://testnet-rpc.monad.xyz \
     --broadcast
   ```

The script will:
1. Deploy `MockStock`, `MockUSDC`, and `MockDividendSource`.
2. Deploy `PrismVault` (which automatically deploys `PrincipalToken` and `EpochCoupon`).
3. Initialize 4 quarterly epochs (Q1 to Q4).
4. Mint test balances of 1,000,000 `mSTOCK` and 1,000,000 `mUSDC` to the deployer.

---

## 9. Web Application & Design System

The official prospectus landing page is located in [`web/`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/web).

### Design Philosophy
- **Editorial Prospectus**: Rejects crypto-startup cliches (no blue, no purple neon, no gradients, no glassmorphism).
- **Core Motif**: The split-line hairline mark dividing incoming shares into Principal (top/ink) and Coupon (bottom/vermilion).
- **Typography**: Self-hosted `Newsreader` (display serif), `Hanken Grotesk` (body sans), and `IBM Plex Mono` (tabular numbers).
- **Performance**: Sub-60KB gzip total bundle weight, zero layout shift, responsive down to 360px.
- **Accessibility**: WCAG AAA/AA color contrast, keyboard skip link (`#main-content`), 44px minimum touch targets, and full `prefers-reduced-motion` compliance.

Detailed design system tokens and component specs are documented in [`docs/DESIGN_SYSTEM.md`](file:///d:/Study/Hackthon/Metropolis(Monad)/prism/docs/DESIGN_SYSTEM.md).

### Run Locally

Run the complete Prism stack locally on an Anvil chain with 3 commands:

```bash
# 1. Install dependencies
npm --prefix web install

# 2. Deploy contracts and seed epochs to local Anvil (spawns Anvil if not running)
bash script/DeployLocal.sh    # On Windows: powershell -File script/DeployLocal.ps1

# 3. Start local web application
npm --prefix web run dev
```

Visit `http://localhost:5173/` for the prospectus and `http://localhost:5173/#/app` for the live trading application.

To run the automated end-to-end integration lifecycle against local Anvil:
```bash
node web/scripts/e2e-local.mjs
```

### Local Architecture

```
┌────────────────────────────────────────────────────────┐
│             Prism Web Application (Vite)               │
│                                                        │
│  Route /#/     : Prospectus Landing Page               │
│  Route /#/app  : Working Terminal (Chain ID 31337)     │
│  - Split & Redeem (Deposit stock, Mint PT & EC)       │
│  - Dutch Market (1s live decay price ticker, buys)    │
│  - Dividend Curve (Term structure, implied yield)     │
│  - Portfolio & Claim (Pro-rata dividend settlement)   │
│  - Simulation Drawer (Faucet mint, declare dividend)  │
└───────────────────────────┬────────────────────────────┘
                            │ Viem RPC & Event Indexing
                            ▼
┌────────────────────────────────────────────────────────┐
│             Local Anvil Node (Chain 31337)             │
│                                                        │
│  Contracts:                                            │
│  - PrismVault (Collateral lock, PT & EC minting)       │
│  - PrismAuction (Dutch auctions, mulDiv ceil math)     │
│  - PrincipalToken (ERC-20 capital leg)                 │
│  - EpochCoupon (ERC-1155 dividend claim vouchers)      │
│  - MockStock & MockUSDC (Test tokens)                  │
│  - MockDividendSource (Oracle corporate action fixture)│
└────────────────────────────────────────────────────────┘
```

- **Local Chain (Anvil 31337)**: Runs an instant, zero-cost Ethereum-compatible EVM node at `http://127.0.0.1:8545`.
- **Event-Driven Indexing**: Instead of modifying immutable contracts to add gas-heavy getters, the frontend uses Viem's `publicClient.getLogs` over `AuctionCreated` and `EpochFunded` events to reconstruct market order books dynamically.
- **In-Memory Actor Switcher**: Switch between Anvil's standard deterministic accounts (Deployer/Treasury, Alice, Bob) instantly to test bilateral trading, liquidity seeding, and dividend distributions with zero browser wallet setup required. Injected browser wallets (Rabby, MetaMask) remain fully supported.
- **Strict Financial Settlement**: The Dutch auction uses `Math.mulDiv` rounding up (`Math.Rounding.Ceil`) so buyers never underpay for fractional coupons, verified by invariant and fuzz tests.

---

## 10. Application Screenshots

### Prospectus Landing Page (Route `#/`)
| Dark Mode (`ink`) | Light Mode (`paper`) |
|---|---|
| ![Landing Ink](docs/screenshots/landing-1440px-ink.png) | ![Landing Paper](docs/screenshots/landing-1440px-paper.png) |

### Working Application (Route `#/app`)
| 01. Split & Redeem (`ink`) | 02. Dutch Auction Market (`ink`) |
|---|---|
| ![Split & Redeem](docs/screenshots/app-split-1440px-ink.png) | ![Dutch Market](docs/screenshots/app-market-1440px-ink.png) |

| 03. Dividend Yield Curve (`ink`) | Simulation Drawer Controls |
|---|---|
| ![Dividend Curve](docs/screenshots/app-curve-1440px-ink.png) | ![Anvil Controls Drawer](docs/screenshots/app-drawer-1440px-ink.png) |

### Responsive Mobile (390px Viewport)
| Mobile Prospectus | Mobile Portfolio & Claim |
|---|---|
| ![Mobile Landing](docs/screenshots/landing-390px-ink.png) | ![Mobile Portfolio](docs/screenshots/app-portfolio-390px-ink.png) |

