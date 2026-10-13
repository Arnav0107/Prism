# Future Architecture Roadmap — Prism Protocol

Prism transforms tokenized real-world equities (RWA) into perpetual capital exposure (Principal Tokens) and discrete dividend yield rights (Epoch Coupons). While the core protocol implements a mathematically sound stripping vault, Dutch auction marketplace, factory registry, and one-click liquidity zaps, the following architectural milestones outline the post-hackathon production roadmap.

---

## 1. Pendle-Style AMM for Principal Tokens & Epoch Coupons

### Motivation
Dutch auctions provide excellent discrete price discovery for primary issuers and large sellers, but secondary traders and liquidity providers require continuous, passive market-making with automated price decay.

### Architecture Plan
- **Yield Space AMM Integration**: Adapt the Yield Space invariant $x^{1-t} + y^{1-t} = k$ specifically tailored for tokenized equity coupons with fixed maturities (ex-dividend dates).
- **Time-Decaying Liquidity Pools**: As the ex-dividend date approaches ($t \to 1$), the time-decay factor automatically drives the relative valuation of Epoch Coupons toward fair value, preventing impermanent loss caused by deterministic coupon expiration.
- **PT-Asset Pools**: Principal Tokens trade in concentrated liquidity pools against the underlying tokenized stock collateral, with trading discounts reflecting the risk-free rate of forward dividend strips until maturity.

---

## 2. Dividend Baskets (Synthetic Index & ETF Stripping)

### Motivation
Retail and institutional investors often seek index-level dividend exposure (e.g. S&P 500 Dividend Aristocrats or High-Yield REIT baskets) rather than single-stock dividend risk.

### Architecture Plan
- **Basket Stripping Vaults**: Introduce `PrismBasketVault` supporting weighted multi-collateral inputs (e.g. 25% mAAPL, 25% mMSFT, 25% mNVDA, 25% mGOOGL).
- **Composite Coupon Tokens**: The vault issues composite Epoch Coupons representing an aggregated quarterly payout basket.
- **Automated Dividend Aggregation**: As individual component equities declare and fund dividends throughout the quarter, payouts accumulate in a settlement buffer and disburse as a unified payment on the basket pay date.

---

## 3. Comprehensive Corporate Actions Oracle

### Motivation
Equities experience diverse corporate events beyond standard recurring cash dividends, including stock splits, spinoffs, rights offerings, and special one-off liquidating distributions.

### Architecture Plan
- **Decentralized Corporate Action Oracle (DCAO)**: Chainlink CRE or Pyth Network integration delivering cryptographic attestation of verified SEC 8-K / corporate action filings.
- **Stock Split Handling**: Proportional share adjustment multipliers natively updating vault shares without diluting Principal Token or Epoch Coupon balances.
- **Spinoff Token Distribution**: When a company spins off a subsidiary (e.g. 1 share of Subsidiary per 10 shares of Parent), the vault claims the spinoff tokens and distributes them pro-rata to coupon holders as an in-kind distribution or liquidates them into settlement USDC.

---

## 4. Cross-Chain Dividend Settlement via Monad Fast Finality & CCIP

### Motivation
While Monad provides high throughput (10,000 TPS) and sub-second 1-slot finality ideal for high-frequency dividend trading and yield discovery, underlying tokenized stock collateral often resides across heterogeneous L1/L2 ecosystems (Ethereum mainnet, Arbitrum, Avalanche, Polygon).

### Architecture Plan
- **Cross-Chain Collateral Escrow**: Lock tokenized stock in custody vaults on Ethereum Mainnet or Arbitrum.
- **Chainlink CCIP Messaging**: Transmit cross-chain minting instructions to Monad, where high-speed stripping, trading, and Dutch auctions execute gas-efficiently.
- **Cross-Chain Yield Teleportation**: Allow coupon holders on Monad to elect automated payout delivery to any supported EVM destination chain upon `claim()`.

---

## 5. Protocol Subgraphs & High-Performance Indexer

### Motivation
Visualizing historical dividend term structures, clearing price curves, implied dividend yields, and user portfolio performance requires sub-second GraphQL queries.

### Architecture Plan
- **Goldsky / Envio / The Graph Subgraph**: Comprehensive subgraph indexing:
  - `EpochCreated`, `VaultSealed`, `Deposited`, `Recombined`, `PrincipalRedeemed`.
  - `AuctionCreated`, `Purchase`, `AuctionCancelled` with volume, pricing, and fill history.
  - Historical implied quarterly yield curves ($Y_{quarterly} = \frac{VWAP \times 10,000}{P_{ref}}$).
- **Real-Time WebSocket Stream**: Live Dutch auction price tick updates and order book depths.

---

## 6. Protocol Insurance Pool & Default Haircut Mechanisms

### Motivation
In the event that an issuer or tokenized stock custodian experiences unexpected insolvency, regulatory freeze, or default before funding an ex-date dividend, the protocol must preserve user capital and resolve defaulted coupons deterministically.

### Architecture Plan
- **Grace Period Default Resolution**: `PrismVault` enforces a strict 30-day `FUNDING_GRACE` period. If an epoch lapses unfunded past grace, the epoch is flagged `defaulted`, releasing unencumbered principal redemptions for PT holders.
- **Backstop Safety Module**: A staker-funded safety pool (stkPRISM) underwriting dividend default shortfalls in exchange for a protocol fee cut from secondary auction volumes.
- **Auction Haircut Settlement**: For defaulted epochs, residual coupon claims receive pro-rata payouts from the insurance pool rather than halting protocol redemptions.
