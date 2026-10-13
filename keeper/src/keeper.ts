import {
  parseAbi,
  formatUnits,
  type Hash,
  getContract,
  type Address,
} from 'viem';
import { type KeeperConfig } from './config.js';
import { logger } from './logger.js';

export const VAULT_ABI = parseAbi([
  'function epochCount() view returns (uint256)',
  'function demoMode() view returns (bool)',
  'function getEpoch(uint256 epochId) view returns ((uint256 exDate, uint256 payDate, bool funded, uint256 totalFundedUSDC, uint256 fundedSupply))',
  'function fundEpoch(uint256 epochId) external',
  'function claim(uint256 epochId, uint256 amount) external',
  'function isSealed() view returns (bool)',
  'event EpochFunded(uint256 indexed epochId, address indexed funder, uint256 payout, uint256 couponSupply)',
  'event CouponClaimed(uint256 indexed epochId, address indexed claimer, uint256 amount, uint256 payout)',
]);

export const AUCTION_ABI = parseAbi([
  'function getAuction(uint256 auctionId) view returns (address seller, uint256 epochId, uint256 amount, uint256 initialAmount, uint256 startPrice, uint256 floorPrice, uint256 startTime, uint256 duration, bool active)',
  'function cancelAuction(uint256 auctionId) external',
  'event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 indexed epochId, uint256 amount, uint256 startPrice, uint256 floorPrice, uint256 duration, uint256 startTime)',
  'event AuctionCancelled(uint256 indexed auctionId, address indexed seller, uint256 indexed epochId, uint256 amount)',
  'event Purchase(uint256 indexed auctionId, address indexed buyer, uint256 amount, uint256 price, uint256 totalCost)',
]);

export const ERC1155_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) view returns (uint256)',
]);

export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

export class PrismKeeper {
  private config: KeeperConfig;
  private isRunning: boolean = false;
  private activeCycle: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private unwatchList: Array<() => void> = [];

  constructor(config: KeeperConfig) {
    this.config = config;
  }

  private async checkGasPrice(): Promise<boolean> {
    try {
      const gasPrice = await this.config.publicClient.getGasPrice();
      if (gasPrice > this.config.maxFeePerGasGwei) {
        logger.warn(
          `Current gas price (${formatUnits(gasPrice, 9)} gwei) exceeds max threshold (${formatUnits(
            this.config.maxFeePerGasGwei,
            9
          )} gwei). Skipping execution cycle.`
        );
        return false;
      }
      return true;
    } catch (err) {
      logger.error('Failed reading current gas price:', err);
      return false;
    }
  }

  private async executeWithRetry<T>(
    actionName: string,
    operation: () => Promise<T>
  ): Promise<T | null> {
    let attempt = 0;
    const delays = [1000, 2000, 4000];

    while (attempt < this.config.maxRetries) {
      try {
        return await operation();
      } catch (err) {
        attempt++;
        const isLast = attempt >= this.config.maxRetries;
        logger.warn(`Action [${actionName}] attempt ${attempt} failed:`, {
          error: err instanceof Error ? err.message : String(err),
          willRetry: !isLast,
        });

        if (isLast) {
          logger.error(`Action [${actionName}] exhausted all ${this.config.maxRetries} retries.`, err);
          return null;
        }

        const waitMs = delays[attempt - 1] || 2000;
        await new Promise((res) => setTimeout(res, waitMs));
      }
    }
    return null;
  }

  /**
   * Identifies and funds epochs that are currently fundable.
   */
  public async fundDueEpochs(): Promise<void> {
    try {
      const [epochCount, demoMode] = await Promise.all([
        this.config.publicClient.readContract({
          address: this.config.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'epochCount',
        }) as Promise<bigint>,
        this.config.publicClient.readContract({
          address: this.config.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'demoMode',
        }) as Promise<boolean>,
      ]);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const FUNDING_GRACE = 7n * 86400n; // 7 days

      for (let i = 1n; i <= epochCount; i++) {
        const epochInfo = (await this.config.publicClient.readContract({
          address: this.config.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'getEpoch',
          args: [i],
        })) as any;

        const exDate: bigint = epochInfo.exDate ?? epochInfo[0] ?? 0n;
        const funded: boolean = epochInfo.funded ?? epochInfo[2] ?? false;

        if (funded) continue; // Already funded

        // If not demoMode, must have reached exDate and be within grace
        if (!demoMode && now < exDate) continue;
        if (!demoMode && now >= exDate + FUNDING_GRACE) continue; // Defaulted post-grace

        // Check & ensure USDC allowance
        const allowance = (await this.config.publicClient.readContract({
          address: this.config.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [this.config.accountAddress, this.config.vaultAddress],
        })) as bigint;

        if (allowance === 0n) {
          if (this.config.dryRun) {
            logger.info(`[DRY-RUN] Epoch #${i} requires USDC allowance. Would approve PrismVault.`);
            continue;
          }
          logger.info('Approving PrismVault for USDC funding...');
          const approveHash = (await (this.config.walletClient as any).writeContract({
            address: this.config.usdcAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [this.config.vaultAddress, 2n ** 256n - 1n],
          })) as Hash;
          await this.config.publicClient.waitForTransactionReceipt({ hash: approveHash });
          logger.success(`Approved USDC | tx: ${approveHash}`);
        }

        logger.info(`Epoch #${i} is DUE and FUNDABLE. Simulating fundEpoch...`);

        // Simulate static call before broadcast
        try {
          await this.config.publicClient.simulateContract({
            address: this.config.vaultAddress,
            abi: VAULT_ABI,
            functionName: 'fundEpoch',
            args: [i],
            account: this.config.accountAddress,
          });
        } catch (simErr) {
          logger.warn(`Simulation of fundEpoch(${i}) failed (insufficient USDC or condition not met):`, {
            error: simErr instanceof Error ? simErr.message : String(simErr),
          });
          continue;
        }

        if (this.config.dryRun) {
          logger.info(`[DRY-RUN] Simulated fundEpoch(#${i}) succeeded. Skipping transaction broadcast.`);
          continue;
        }

        await this.executeWithRetry(`fundEpoch-${i}`, async () => {
          const hash = (await (this.config.walletClient as any).writeContract({
            address: this.config.vaultAddress,
            abi: VAULT_ABI,
            functionName: 'fundEpoch',
            args: [i],
          })) as Hash;

          logger.info(`Broadcasted fundEpoch(#${i}) tx: ${hash}. Waiting confirmation...`);
          const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status === 'success') {
            logger.success(`Successfully FUNDED Epoch #${i}!`, { txHash: hash, blockNumber: receipt.blockNumber.toString() });
          } else {
            throw new Error(`Transaction reverted: ${hash}`);
          }
        });
      }
    } catch (err) {
      logger.error('Error in fundDueEpochs sweep:', err);
    }
  }

  /**
   * Claims payouts for any funded epochs where the keeper holds coupons.
   */
  public async claimDueEpochs(): Promise<void> {
    try {
      const epochCount = (await this.config.publicClient.readContract({
        address: this.config.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'epochCount',
      })) as bigint;

      for (let i = 1n; i <= epochCount; i++) {
        const epochInfo = (await this.config.publicClient.readContract({
          address: this.config.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'getEpoch',
          args: [i],
        })) as any;

        const isFunded = epochInfo.funded ?? epochInfo[2] ?? false;
        if (!isFunded) continue;

        const couponBalance = (await this.config.publicClient.readContract({
          address: this.config.couponAddress,
          abi: ERC1155_ABI,
          functionName: 'balanceOf',
          args: [this.config.accountAddress, i],
        })) as bigint;

        if (couponBalance === 0n) continue;

        logger.info(`Keeper holds ${formatUnits(couponBalance, 18)} coupons for funded Epoch #${i}. Simulating claim...`);

        try {
          await this.config.publicClient.simulateContract({
            address: this.config.vaultAddress,
            abi: VAULT_ABI,
            functionName: 'claim',
            args: [i, couponBalance],
            account: this.config.accountAddress,
          });
        } catch (simErr) {
          logger.warn(`Simulation of claim(${i}) failed:`, {
            error: simErr instanceof Error ? simErr.message : String(simErr),
          });
          continue;
        }

        if (this.config.dryRun) {
          logger.info(`[DRY-RUN] Simulated claim(Epoch #${i}, ${formatUnits(couponBalance, 18)}) succeeded. Skipping broadcast.`);
          continue;
        }

        await this.executeWithRetry(`claim-${i}`, async () => {
          const hash = (await (this.config.walletClient as any).writeContract({
            address: this.config.vaultAddress,
            abi: VAULT_ABI,
            functionName: 'claim',
            args: [i, couponBalance],
          })) as Hash;

          logger.info(`Broadcasted claim(#${i}) tx: ${hash}. Waiting confirmation...`);
          const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status === 'success') {
            logger.success(`Successfully CLAIMED dividends for Epoch #${i}!`, {
              txHash: hash,
              amount: formatUnits(couponBalance, 18),
            });
          } else {
            throw new Error(`Claim transaction reverted: ${hash}`);
          }
        });
      }
    } catch (err) {
      logger.error('Error in claimDueEpochs sweep:', err);
    }
  }

  /**
   * Scans auctions, cancels expired auctions owned by keeper, and logs permissioned auctions.
   */
  public async housekeepAuctions(): Promise<void> {
    try {
      const logs = await this.config.publicClient.getLogs({
        address: this.config.auctionAddress,
        event: AUCTION_ABI[2] as any, // AuctionCreated
        fromBlock: 0n,
      });

      const uniqueAuctionIds = Array.from(new Set(logs.map((l: any) => l.args.auctionId as bigint)));
      const now = BigInt(Math.floor(Date.now() / 1000));

      for (const auctionId of uniqueAuctionIds) {
        try {
          const auctionData = (await this.config.publicClient.readContract({
            address: this.config.auctionAddress,
            abi: AUCTION_ABI,
            functionName: 'getAuction',
            args: [auctionId],
          })) as any;

          const seller: Address = auctionData.seller ?? auctionData[0];
          const epochId: bigint = auctionData.epochId ?? auctionData[1];
          const startTime: bigint = auctionData.startTime ?? auctionData[6];
          const duration: bigint = auctionData.duration ?? auctionData[7];
          const active: boolean = Boolean(auctionData.active ?? auctionData[8]);

          if (!active) continue;

          // Check if auction is expired
          const epochInfo = (await this.config.publicClient.readContract({
            address: this.config.vaultAddress,
            abi: VAULT_ABI,
            functionName: 'getEpoch',
            args: [epochId],
          })) as any;

          const exDate: bigint = epochInfo.exDate ?? epochInfo[0] ?? 0n;
          const isFunded: boolean = epochInfo.funded ?? epochInfo[2] ?? false;

          const isTimeExpired = now >= startTime + duration;
          const isEpochPastExDate = now >= exDate;
          const isExpired = isTimeExpired || isEpochPastExDate || isFunded;

          if (!isExpired) continue;

          const isSeller = seller.toLowerCase() === this.config.accountAddress.toLowerCase();

          if (!isSeller) {
            logger.info(
              `[PERMISSIONED] Auction #${auctionId} is expired (seller: ${seller}), but cancelAuction() requires OnlySeller. Skipping gracefully.`
            );
            continue;
          }

          logger.info(`Auction #${auctionId} is expired and owned by keeper. Simulating cancelAuction...`);

          try {
            await this.config.publicClient.simulateContract({
              address: this.config.auctionAddress,
              abi: AUCTION_ABI,
              functionName: 'cancelAuction',
              args: [auctionId],
              account: this.config.accountAddress,
            });
          } catch (simErr) {
            logger.warn(`Simulation of cancelAuction(${auctionId}) failed:`, {
              error: simErr instanceof Error ? simErr.message : String(simErr),
            });
            continue;
          }

          if (this.config.dryRun) {
            logger.info(`[DRY-RUN] Simulated cancelAuction(#${auctionId}) succeeded. Skipping broadcast.`);
            continue;
          }

          await this.executeWithRetry(`cancelAuction-${auctionId}`, async () => {
            const hash = (await (this.config.walletClient as any).writeContract({
              address: this.config.auctionAddress,
              abi: AUCTION_ABI,
              functionName: 'cancelAuction',
              args: [auctionId],
            })) as Hash;

            logger.info(`Broadcasted cancelAuction(#${auctionId}) tx: ${hash}. Waiting confirmation...`);
            const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === 'success') {
              logger.success(`Successfully CANCELLED expired Auction #${auctionId}!`, { txHash: hash });
            } else {
              throw new Error(`Cancel transaction reverted: ${hash}`);
            }
          });
        } catch (subErr) {
          logger.warn(`Failed inspecting auction #${auctionId}:`, { error: subErr });
        }
      }
    } catch (err) {
      logger.error('Error in housekeepAuctions sweep:', err);
    }
  }

  /**
   * Single deterministic maintenance cycle.
   */
  public async runCycle(): Promise<void> {
    if (this.activeCycle) return;
    this.activeCycle = true;

    try {
      const gasOk = await this.checkGasPrice();
      if (!gasOk) return;

      await this.fundDueEpochs();
      await this.claimDueEpochs();
      await this.housekeepAuctions();
    } finally {
      this.activeCycle = false;
    }
  }

  /**
   * Starts the keeper daemon with backfill and event subscriptions.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('========================================================');
    logger.info('       STARTING PRISM DETERMINISTIC KEEPER DAEMON       ');
    logger.info('========================================================', {
      account: this.config.accountAddress,
      dryRun: this.config.dryRun,
      pollIntervalMs: this.config.pollIntervalMs,
      vault: this.config.vaultAddress,
      auction: this.config.auctionAddress,
    });

    // 1. Initial State Backfill
    logger.info('Performing initial startup backfill sweep...');
    await this.runCycle();
    logger.info('Startup backfill completed successfully.');

    // 2. Event Watchers
    const unwatchEpochFunded = this.config.publicClient.watchContractEvent({
      address: this.config.vaultAddress,
      abi: VAULT_ABI,
      eventName: 'EpochFunded',
      onLogs: (logs) => {
        logger.info(`Observed EpochFunded event(s) (${logs.length}). Triggering claim evaluation.`);
        void this.claimDueEpochs();
      },
    });
    this.unwatchList.push(unwatchEpochFunded);

    const unwatchAuctionCreated = this.config.publicClient.watchContractEvent({
      address: this.config.auctionAddress,
      abi: AUCTION_ABI,
      eventName: 'AuctionCreated',
      onLogs: (logs) => {
        logger.info(`Observed AuctionCreated event(s) (${logs.length}).`);
      },
    });
    this.unwatchList.push(unwatchAuctionCreated);

    // 3. Periodic Poll Loop
    this.intervalTimer = setInterval(() => {
      void this.runCycle();
    }, this.config.pollIntervalMs);

    logger.info(`Keeper daemon active. Listening for events & polling every ${this.config.pollIntervalMs}ms.`);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    logger.info('Gracefully shutting down Prism Keeper daemon...');

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    for (const unwatch of this.unwatchList) {
      try {
        unwatch();
      } catch {
        // ignore
      }
    }
    this.unwatchList = [];
    this.isRunning = false;
    logger.info('Keeper daemon terminated cleanly.');
  }
}
