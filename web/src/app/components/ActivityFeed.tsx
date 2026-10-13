import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { parseAbiItem, formatUnits, type Hash, type Address } from 'viem';
import { useApp } from '../context/AppContext';
import { DEPLOYED_ADDRESSES, MONAD_TESTNET_CHAIN_ID } from '../../chain/contracts';
import { MONAD_EXPLORER_URL } from '../../config/deployments';
import './ActivityFeed.css';

export type ActivityEventType = 'DEPOSIT' | 'TRADE' | 'FUNDING' | 'CLAIM';

export interface ActivityItem {
  id: string; // txHash-logIndex
  type: ActivityEventType;
  txHash: Hash;
  blockNumber: bigint;
  timestampMs: number;
  actor: Address;
  description: string;
  amountLabel: string;
}

export const ActivityFeed: React.FC = () => {
  const { publicClient, chainId } = useApp();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | ActivityEventType>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState<number>(0);

  // Tick every 15s to re-render relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const formatRelativeTime = (timeMs: number): string => {
    const diffSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const shortenAddr = (addr: string): string => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const fetchRecentLogs = useCallback(async () => {
    if (!publicClient || !DEPLOYED_ADDRESSES.PrismVault) return;

    try {
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const currentBlockNum = latestBlock.number;
      const blockRange = chainId === MONAD_TESTNET_CHAIN_ID ? 90n : 1000n;
      const fromBlock = currentBlockNum > blockRange ? currentBlockNum - blockRange : 0n;

      // 1. Fetch Vault Deposited
      const depositLogsPromise = publicClient.getLogs({
        address: DEPLOYED_ADDRESSES.PrismVault,
        event: parseAbiItem('event Deposited(address indexed user, uint256 amount)'),
        fromBlock,
      });

      // 2. Fetch Vault EpochFunded
      const fundingLogsPromise = publicClient.getLogs({
        address: DEPLOYED_ADDRESSES.PrismVault,
        event: parseAbiItem(
          'event EpochFunded(uint256 indexed epochId, address indexed funder, uint256 payout, uint256 couponSupply)'
        ),
        fromBlock,
      });

      // 3. Fetch Vault CouponClaimed
      const claimLogsPromise = publicClient.getLogs({
        address: DEPLOYED_ADDRESSES.PrismVault,
        event: parseAbiItem(
          'event CouponClaimed(uint256 indexed epochId, address indexed claimer, uint256 amount, uint256 payout)'
        ),
        fromBlock,
      });

      // 4. Fetch Auction Purchase
      const tradeLogsPromise = DEPLOYED_ADDRESSES.PrismAuction
        ? publicClient.getLogs({
            address: DEPLOYED_ADDRESSES.PrismAuction,
            event: parseAbiItem(
              'event Purchase(uint256 indexed auctionId, address indexed buyer, uint256 amount, uint256 price, uint256 totalCost)'
            ),
            fromBlock,
          })
        : Promise.resolve([]);

      const [depositLogs, fundingLogs, claimLogs, tradeLogs] = await Promise.all([
        depositLogsPromise.catch(() => []),
        fundingLogsPromise.catch(() => []),
        claimLogsPromise.catch(() => []),
        tradeLogsPromise.catch(() => []),
      ]);

      const now = Date.now();
      const parsedItems: ActivityItem[] = [];

      for (const log of depositLogs) {
        const id = `${log.transactionHash}-${log.logIndex}`;
        const amountNum = Number(formatUnits(log.args.amount ?? 0n, 18)).toFixed(2);
        parsedItems.push({
          id,
          type: 'DEPOSIT',
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestampMs: now - Number(currentBlockNum - log.blockNumber) * 1000,
          actor: log.args.user as Address,
          description: `Stripped ${amountNum} shares into PT & Coupons`,
          amountLabel: `+${amountNum} mSTOCK`,
        });
      }

      for (const log of fundingLogs) {
        const id = `${log.transactionHash}-${log.logIndex}`;
        const payoutUsdc = Number(formatUnits(log.args.payout ?? 0n, 6)).toFixed(2);
        parsedItems.push({
          id,
          type: 'FUNDING',
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestampMs: now - Number(currentBlockNum - log.blockNumber) * 1000,
          actor: log.args.funder as Address,
          description: `Funded Epoch #${log.args.epochId} distribution pool`,
          amountLabel: `$${payoutUsdc} USDC`,
        });
      }

      for (const log of claimLogs) {
        const id = `${log.transactionHash}-${log.logIndex}`;
        const payoutUsdc = Number(formatUnits(log.args.payout ?? 0n, 6)).toFixed(2);
        parsedItems.push({
          id,
          type: 'CLAIM',
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestampMs: now - Number(currentBlockNum - log.blockNumber) * 1000,
          actor: log.args.claimer as Address,
          description: `Claimed dividend payout for Epoch #${log.args.epochId}`,
          amountLabel: `+$${payoutUsdc} USDC`,
        });
      }

      for (const log of tradeLogs) {
        const id = `${log.transactionHash}-${log.logIndex}`;
        const amountNum = Number(formatUnits(log.args.amount ?? 0n, 18)).toFixed(2);
        const costUsdc = Number(formatUnits(log.args.totalCost ?? 0n, 6)).toFixed(2);
        parsedItems.push({
          id,
          type: 'TRADE',
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestampMs: now - Number(currentBlockNum - log.blockNumber) * 1000,
          actor: log.args.buyer as Address,
          description: `Purchased coupons on Dutch auction #${log.args.auctionId}`,
          amountLabel: `${amountNum} EC ($${costUsdc})`,
        });
      }

      // Sort newest first
      parsedItems.sort((a, b) => {
        if (b.blockNumber !== a.blockNumber) {
          return Number(b.blockNumber - a.blockNumber);
        }
        return b.id.localeCompare(a.id);
      });

      // Deduplicate
      const seen = new Set<string>();
      const deduped: ActivityItem[] = [];
      for (const item of parsedItems) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          deduped.push(item);
        }
      }

      setItems(deduped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed querying on-chain events');
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, chainId]);

  // Initial load and gentle 10s poll
  useEffect(() => {
    void fetchRecentLogs();
    const interval = setInterval(() => {
      void fetchRecentLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchRecentLogs]);

  const filteredItems = useMemo(() => {
    if (filter === 'ALL') return items;
    return items.filter((item) => item.type === filter);
  }, [items, filter]);

  const getExplorerUrl = (txHash: Hash): string => {
    if (chainId === MONAD_TESTNET_CHAIN_ID) {
      return `${MONAD_EXPLORER_URL}/tx/${txHash}`;
    }
    return `${MONAD_EXPLORER_URL}/tx/${txHash}`;
  };

  return (
    <section className="activity-feed" aria-labelledby="activity-feed-heading">
      <div className="activity-feed__header">
        <div className="activity-feed__title-group">
          <div className="activity-feed__live-indicator font-mono">
            <span className="activity-feed__pulse-dot"></span>
            LIVE
          </div>
          <h3 id="activity-feed-heading" className="activity-feed__title">
            On-Chain Activity Feed
          </h3>
        </div>

        {/* Filter Pills */}
        <div className="activity-feed__filters font-mono">
          {(['ALL', 'DEPOSIT', 'TRADE', 'FUNDING', 'CLAIM'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`activity-feed__filter-btn ${filter === f ? 'activity-feed__filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="activity-feed__loading font-mono">
          <span className="activity-feed__loading-spinner"></span>
          STREAMING ON-CHAIN LOGS...
        </div>
      ) : error && items.length === 0 ? (
        <div className="activity-feed__empty font-mono">
          <span>Error loading events: {error}</span>
          <button
            type="button"
            className="prism-btn prism-btn--secondary"
            style={{ width: 'auto', margin: '8px auto 0' }}
            onClick={() => void fetchRecentLogs()}
          >
            Retry
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="activity-feed__empty font-mono">
          No on-chain {filter === 'ALL' ? '' : filter.toLowerCase()} events recorded in recent blocks.
        </div>
      ) : (
        <div className="activity-feed__list">
          {filteredItems.map((item) => (
            <div key={item.id} className="activity-feed__item">
              <div className="activity-feed__item-left">
                <span
                  className={`activity-feed__badge activity-feed__badge--${item.type.toLowerCase()} font-mono`}
                >
                  {item.type}
                </span>

                <div className="activity-feed__details">
                  <span className="activity-feed__desc font-mono">{item.description}</span>
                  <span className="activity-feed__actor font-mono">
                    Actor: {shortenAddr(item.actor)} &bull; {item.amountLabel}
                  </span>
                </div>
              </div>

              <div className="activity-feed__item-right font-mono">
                <span className="activity-feed__time">{formatRelativeTime(item.timestampMs)}</span>
                <a
                  href={getExplorerUrl(item.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="activity-feed__explorer-link font-mono"
                  title="View transaction on block explorer"
                >
                  TX &nearr;
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
