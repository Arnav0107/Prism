import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatStock,
  formatUsdc,
  formatUsdcPrice,
  parseStock,
  parseUsdc,
  calculateBuyCostCeil,
  buyAuction,
  cancelAuction,
  approveUsdc,
  approveCouponsForAuction,
  createAuction,
  createBatchAuctions,
  DEPLOYED_ADDRESSES,
} from '../../chain/contracts';
import { decodeContractError } from '../../chain/errors';
import './MarketScreen.css';

export const MarketScreen: React.FC = () => {
  const {
    walletClient,
    publicClient,
    accountAddress,
    auctions,
    vaultData,
    userBalances,
    refreshData,
    addToast,
    updateToast,
  } = useApp();

  const [selectedAuctionId, setSelectedAuctionId] = useState<number | null>(null);
  const [buyAmountInput, setBuyAmountInput] = useState('1');
  const [maxPriceInput, setMaxPriceInput] = useState('1.50');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live prices per second
  const [livePrices, setLivePrices] = useState<Record<number, bigint>>({});

  // Sell form state
  const [sellMode, setSellMode] = useState<'single' | 'batch'>('single');
  const [sellEpochId, setSellEpochId] = useState(1);
  const [sellAmountInput, setSellAmountInput] = useState('5');
  const [sellStartPriceInput, setSellStartPriceInput] = useState('2.00');
  const [sellFloorPriceInput, setSellFloorPriceInput] = useState('0.50');
  const [sellDurationInput, setSellDurationInput] = useState('3600'); // 1 hour

  // 1-second price ticker timer
  useEffect(() => {
    let isCancelled = false;

    const updateTicker = async () => {
      const updated: Record<number, bigint> = {};
      for (const a of auctions) {
        if (a.active) {
          try {
            const contract = {
              address: DEPLOYED_ADDRESSES.PrismAuction,
              abi: [
                {
                  type: 'function',
                  name: 'currentPrice',
                  inputs: [{ name: 'auctionId', type: 'uint256' }],
                  outputs: [{ name: '', type: 'uint256' }],
                  stateMutability: 'view',
                },
              ],
            } as const;
            const price = (await publicClient.readContract({
              ...contract,
              functionName: 'currentPrice',
              args: [BigInt(a.auctionId)],
            })) as bigint;
            updated[a.auctionId] = price;
          } catch {
            updated[a.auctionId] = a.floorPrice;
          }
        }
      }
      if (!isCancelled) {
        setLivePrices(updated);
      }
    };

    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [auctions, publicClient]);

  const activeAuction = auctions.find((a) => a.auctionId === selectedAuctionId) ?? auctions[0];
  const activeAuctionCurrentPrice =
    (activeAuction ? livePrices[activeAuction.auctionId] : null) ?? activeAuction?.currentPrice ?? 0n;

  // Buy Math
  const parsedBuyAmount = parseStock(buyAmountInput);
  const parsedMaxPrice = parseUsdc(maxPriceInput);
  const exactCostPreview = calculateBuyCostCeil(parsedBuyAmount, parsedMaxPrice);

  const usdcBalance = userBalances?.usdcBalance ?? 0n;
  const usdcAllowanceAuction = userBalances?.usdcAllowanceAuction ?? 0n;
  const hasInsufficientUsdc = exactCostPreview > usdcBalance;
  const needsUsdcApproval = exactCostPreview > 0n && usdcAllowanceAuction < exactCostPreview;

  const handleApproveUsdc = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Approving USDC',
      message: `Approving ${formatUsdc(exactCostPreview)} USDC for PrismAuction...`,
    });

    try {
      const hash = await approveUsdc(walletClient, DEPLOYED_ADDRESSES.PrismAuction, exactCostPreview);
      updateToast(toastId, { message: 'Waiting for confirmation...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, { type: 'success', title: 'USDC Approved', message: 'Allowance updated.' });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Approval Failed', message: decodeContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBuy = async () => {
    if (!activeAuction) return;
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Executing Dutch Buy',
      message: `Buying ${buyAmountInput} coupons at limit price $${maxPriceInput}...`,
    });

    try {
      const hash = await buyAuction(walletClient, activeAuction.auctionId, parsedBuyAmount, parsedMaxPrice);
      updateToast(toastId, { message: 'Settling trade on-chain...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Fill Completed',
        message: `Filled ${buyAmountInput} coupons from Auction #${activeAuction.auctionId}.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Fill Reverted', message: decodeContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (auctionId: number) => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Cancelling Auction',
      message: `Refunding escrowed coupons for Auction #${auctionId}...`,
    });

    try {
      const hash = await cancelAuction(walletClient, auctionId);
      updateToast(toastId, { message: 'Cancelling auction order...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Auction Cancelled',
        message: `Refunded remaining coupons to your wallet.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Cancel Failed', message: decodeContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveCoupons = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Approving Coupons',
      message: 'Approving PrismAuction for EpochCoupons...',
    });

    try {
      const hash = await approveCouponsForAuction(walletClient, true);
      updateToast(toastId, { message: 'Confirming approval...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, { type: 'success', title: 'Coupons Approved', message: 'Escrow permission granted.' });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Approval Failed', message: decodeContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSale = async () => {
    setIsSubmitting(true);
    const parsedAmt = parseStock(sellAmountInput);
    const parsedStart = parseUsdc(sellStartPriceInput);
    const parsedFloor = parseUsdc(sellFloorPriceInput);
    const parsedDuration = BigInt(sellDurationInput);

    const toastId = addToast({
      type: 'pending',
      title: 'Creating Dutch Auction',
      message: `Escrowing coupons to begin descending Dutch Auction...`,
    });

    try {
      let hash: `0x${string}`;
      if (sellMode === 'single') {
        hash = await createAuction(
          walletClient,
          sellEpochId,
          parsedAmt,
          parsedStart,
          parsedFloor,
          parsedDuration
        );
      } else {
        // Batch sell next 4 dividends
        const epochs = [1, 2, 3, 4];
        const amounts = [parsedAmt, parsedAmt, parsedAmt, parsedAmt];
        const starts = [parsedStart, parsedStart, parsedStart, parsedStart];
        const floors = [parsedFloor, parsedFloor, parsedFloor, parsedFloor];
        hash = await createBatchAuctions(
          walletClient,
          epochs,
          amounts,
          starts,
          floors,
          parsedDuration
        );
      }

      updateToast(toastId, { message: 'Broadcasting auction order...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Auction Active',
        message: 'Dutch auction initialized with live linear price decay.',
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Auction Creation Failed', message: decodeContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="prism-market-screen font-mono">
      <div className="prism-market-screen__layout">
        {/* Left Column: Live Auctions List */}
        <section className="prism-card prism-market-screen__auctions-col" aria-labelledby="live-auctions-heading">
          <div className="prism-card__header">
            <span className="prism-card__step font-mono">ORDER BOOK</span>
            <h2 id="live-auctions-heading" className="prism-card__title">
              Descending Dutch Auctions
            </h2>
          </div>

          <p className="prism-card__desc">
            Sellers escrow EpochCoupons. Price decays per second. Buyers execute partially or in full at current block
            price.
          </p>

          {auctions.length === 0 ? (
            <div className="prism-empty-state">
              <span className="prism-empty-state__tag">NO ACTIVE LOTS</span>
              <p>No Dutch auctions currently open on-chain. Create an auction below to seed market liquidity.</p>
            </div>
          ) : (
            <div className="prism-auction-cards-list">
              {auctions.map((a) => {
                const curPrice = livePrices[a.auctionId] ?? a.currentPrice;
                const isSelected = activeAuction?.auctionId === a.auctionId;
                const pctRemaining =
                  a.totalAmount > 0n ? Number((a.remainingAmount * 100n) / a.totalAmount) : 0;
                const isSeller = a.seller.toLowerCase() === accountAddress.toLowerCase();

                return (
                  <article
                    key={a.auctionId}
                    className={`prism-lot-card ${isSelected ? 'prism-lot-card--selected' : ''}`}
                    onClick={() => {
                      setSelectedAuctionId(a.auctionId);
                      setMaxPriceInput(formatUsdcPrice(curPrice));
                    }}
                  >
                    <div className="prism-lot-card__header">
                      <span className="prism-lot-card__id">LOT #{a.auctionId}</span>
                      <span className="prism-lot-card__epoch">EPOCH {a.epochId}</span>
                      <span className={`prism-tag ${a.active ? 'prism-tag--accent' : 'prism-tag--neutral'}`}>
                        {a.active ? 'LIVE' : 'CLOSED'}
                      </span>
                    </div>

                    <div className="prism-lot-card__body">
                      <div className="prism-lot-card__price-block">
                        <span className="prism-lot-card__price-label">CLEARING PRICE (LIVE TICKER):</span>
                        <span className="prism-lot-card__price-val">
                          ${formatUsdcPrice(curPrice)} <small>USDC</small>
                        </span>
                      </div>

                      <div className="prism-lot-card__stats">
                        <div className="prism-lot-card__stat-row">
                          <span>REMAINING:</span>
                          <strong>{formatStock(a.remainingAmount)} / {formatStock(a.totalAmount)} EC</strong>
                        </div>
                        <div className="prism-progress-bar">
                          <div className="prism-progress-bar__fill" style={{ width: `${pctRemaining}%` }}></div>
                        </div>
                        <div className="prism-lot-card__stat-row prism-lot-card__stat-row--subtle">
                          <span>RANGE: ${formatUsdcPrice(a.startPrice)} &rarr; ${formatUsdcPrice(a.floorPrice)}</span>
                          <span>{pctRemaining}% AVAIL</span>
                        </div>
                      </div>
                    </div>

                    {isSeller && a.active && (
                      <div className="prism-lot-card__footer">
                        <button
                          type="button"
                          className="prism-lot-card__cancel-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(a.auctionId);
                          }}
                          disabled={isSubmitting}
                        >
                          CANCEL & REFUND
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Buy Execution Box & Sell Box */}
        <div className="prism-market-screen__right-col">
          {/* Buy Box */}
          <section className="prism-card" aria-labelledby="buy-heading">
            <div className="prism-card__header">
              <span className="prism-card__step font-mono">EXECUTION</span>
              <h2 id="buy-heading" className="prism-card__title">
                Buy Coupons (Fill Lot)
              </h2>
            </div>

            {activeAuction && activeAuction.active ? (
              <div>
                <div className="prism-active-lot-banner">
                  <span>SELECTED: LOT #{activeAuction.auctionId} (EPOCH {activeAuction.epochId})</span>
                  <strong>${formatUsdcPrice(activeAuctionCurrentPrice)} USDC</strong>
                </div>

                <div className="prism-form-group">
                  <div className="prism-form-group__label-row">
                    <label htmlFor="buy-amount-input">QUANTITY TO PURCHASE (EC)</label>
                    <span>AVAILABLE: {formatStock(activeAuction.remainingAmount)}</span>
                  </div>
                  <input
                    id="buy-amount-input"
                    type="number"
                    step="0.1"
                    min="0"
                    className="prism-input font-mono"
                    value={buyAmountInput}
                    onChange={(e) => setBuyAmountInput(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="prism-form-group">
                  <div className="prism-form-group__label-row">
                    <label htmlFor="buy-max-price-input">MAX LIMIT PRICE (USDC PER COUPON)</label>
                    <button
                      type="button"
                      className="prism-inline-link"
                      onClick={() => setMaxPriceInput(formatUsdcPrice(activeAuctionCurrentPrice))}
                    >
                      USE CURRENT (${formatUsdcPrice(activeAuctionCurrentPrice)})
                    </button>
                  </div>
                  <input
                    id="buy-max-price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    className="prism-input font-mono"
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Exact Cost Preview Rounded UP */}
                <div className="prism-callout">
                  <div className="prism-callout__row">
                    <span>SETTLEMENT MATH:</span>
                    <span>Math.mulDiv(qty, price, 1e18, Ceil)</span>
                  </div>
                  <div className="prism-callout__row">
                    <span>EXACT COST PREVIEW (ROUNDED UP):</span>
                    <strong className="prism-callout__val">
                      ${formatUsdc(exactCostPreview)} USDC
                    </strong>
                  </div>
                  <div className="prism-callout__row">
                    <span>YOUR USDC BALANCE:</span>
                    <span>${formatUsdc(usdcBalance)} USDC</span>
                  </div>
                </div>

                <div className="prism-btn-stack">
                  {needsUsdcApproval ? (
                    <button
                      type="button"
                      className="prism-btn prism-btn--primary"
                      onClick={handleApproveUsdc}
                      disabled={isSubmitting || hasInsufficientUsdc || exactCostPreview === 0n}
                    >
                      {hasInsufficientUsdc ? 'INSUFFICIENT USDC BALANCE' : 'APPROVE USDC FOR AUCTION'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="prism-btn prism-btn--primary"
                      onClick={handleBuy}
                      disabled={
                        isSubmitting ||
                        hasInsufficientUsdc ||
                        exactCostPreview === 0n ||
                        parsedBuyAmount > activeAuction.remainingAmount
                      }
                    >
                      {hasInsufficientUsdc
                        ? 'INSUFFICIENT USDC BALANCE'
                        : parsedBuyAmount > activeAuction.remainingAmount
                          ? 'EXCEEDS REMAINING LOT SIZE'
                          : isSubmitting
                            ? 'FILLING ORDER...'
                            : `BUY ${buyAmountInput || '0'} COUPONS`}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="prism-empty-state">
                <p>Select an active lot on the left to execute a buy fill.</p>
              </div>
            )}
          </section>

          {/* Sell Form */}
          <section className="prism-card" aria-labelledby="sell-heading">
            <div className="prism-card__header">
              <span className="prism-card__step font-mono">SELLER LISTING</span>
              <h2 id="sell-heading" className="prism-card__title">
                Sell Dividends (Create Dutch Auction)
              </h2>
            </div>

            <div className="prism-tabs-sub font-mono">
              <button
                type="button"
                className={`prism-tabs-sub__btn ${sellMode === 'single' ? 'prism-tabs-sub__btn--active' : ''}`}
                onClick={() => setSellMode('single')}
              >
                SINGLE LOT
              </button>
              <button
                type="button"
                className={`prism-tabs-sub__btn ${sellMode === 'batch' ? 'prism-tabs-sub__btn--active' : ''}`}
                onClick={() => setSellMode('batch')}
              >
                BATCH SELL (NEXT 4 DIVIDENDS)
              </button>
            </div>

            {sellMode === 'single' && (
              <div className="prism-form-group">
                <label htmlFor="sell-epoch-select">TARGET EPOCH</label>
                <select
                  id="sell-epoch-select"
                  className="prism-input font-mono"
                  value={sellEpochId}
                  onChange={(e) => setSellEpochId(Number(e.target.value))}
                  disabled={isSubmitting}
                >
                  {vaultData?.epochs.map((ep) => (
                    <option key={ep.epochId} value={ep.epochId}>
                      Epoch {ep.epochId} (Coupon Balance: {formatStock(userBalances?.couponBalances[ep.epochId] ?? 0n)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="prism-form-group">
              <div className="prism-form-group__label-row">
                <label htmlFor="sell-amount-input">
                  {sellMode === 'single' ? 'AMOUNT TO SELL (EC)' : 'AMOUNT PER EPOCH (EC)'}
                </label>
              </div>
              <input
                id="sell-amount-input"
                type="number"
                step="0.5"
                min="0"
                className="prism-input font-mono"
                value={sellAmountInput}
                onChange={(e) => setSellAmountInput(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="prism-form-row">
              <div className="prism-form-group">
                <label htmlFor="sell-start-price">START PRICE ($)</label>
                <input
                  id="sell-start-price"
                  type="number"
                  step="0.05"
                  min="0"
                  className="prism-input font-mono"
                  value={sellStartPriceInput}
                  onChange={(e) => setSellStartPriceInput(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="prism-form-group">
                <label htmlFor="sell-floor-price">FLOOR PRICE ($)</label>
                <input
                  id="sell-floor-price"
                  type="number"
                  step="0.05"
                  min="0"
                  className="prism-input font-mono"
                  value={sellFloorPriceInput}
                  onChange={(e) => setSellFloorPriceInput(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="prism-form-group">
              <label htmlFor="sell-duration-input">DURATION (SECONDS)</label>
              <input
                id="sell-duration-input"
                type="number"
                step="60"
                min="60"
                className="prism-input font-mono"
                value={sellDurationInput}
                onChange={(e) => setSellDurationInput(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="prism-btn-stack">
              {!userBalances?.isAuctionApprovedCoupons ? (
                <button
                  type="button"
                  className="prism-btn prism-btn--secondary"
                  onClick={handleApproveCoupons}
                  disabled={isSubmitting}
                >
                  APPROVE COUPONS FOR ESCROW
                </button>
              ) : (
                <button
                  type="button"
                  className="prism-btn prism-btn--primary"
                  onClick={handleCreateSale}
                  disabled={isSubmitting || parseStock(sellAmountInput) === 0n}
                >
                  {isSubmitting
                    ? 'INITIALIZING AUCTION...'
                    : sellMode === 'single'
                      ? 'LIST SINGLE DUTCH AUCTION'
                      : 'LIST BATCH (4 QUARTERS)'}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
