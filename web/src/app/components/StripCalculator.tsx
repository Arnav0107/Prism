import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  CALCULATOR_DEFAULTS,
  calculateStripVsHold,
  type CalculatorAssumptions,
} from '../../config/calculatorConstants';
import './StripCalculator.css';

export const StripCalculator: React.FC = () => {
  const { vaultData } = useApp();

  const [sharesInput, setSharesInput] = useState<string>('100');
  const [priceInput, setPriceInput] = useState<string>(
    CALCULATOR_DEFAULTS.defaultStockPriceUsd.toFixed(2)
  );

  // Derive assumptions from on-chain state when available
  const assumptions: CalculatorAssumptions = useMemo(() => {
    let divPerEpoch = CALCULATOR_DEFAULTS.defaultDividendPerEpochUsd;
    let epochCount = CALCULATOR_DEFAULTS.defaultEpochsCount;

    if (vaultData && vaultData.epochs.length > 0) {
      epochCount = vaultData.epochs.length;
      // If declared gross dividend exists on any epoch, use the first declared net USDC per share
      const declaredEpoch = vaultData.epochs.find((e) => (e.grossUsdcPerShare ?? 0n) > 0n);
      if (declaredEpoch && declaredEpoch.grossUsdcPerShare !== undefined) {
        divPerEpoch = Number(declaredEpoch.grossUsdcPerShare) / 1e6;
      }
    }

    return {
      ...CALCULATOR_DEFAULTS,
      defaultDividendPerEpochUsd: divPerEpoch,
      defaultEpochsCount: epochCount,
    };
  }, [vaultData]);

  const shares = parseFloat(sharesInput);
  const sharePrice = parseFloat(priceInput);

  const isValidInput = !isNaN(shares) && shares > 0 && !isNaN(sharePrice) && sharePrice > 0;

  const result = useMemo(() => {
    if (!isValidInput) {
      return calculateStripVsHold(0, 0, assumptions);
    }
    return calculateStripVsHold(shares, sharePrice, assumptions);
  }, [shares, sharePrice, assumptions, isValidInput]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    []
  );

  return (
    <section className="strip-calc" aria-labelledby="strip-calc-title">
      <div className="strip-calc__header">
        <h2 id="strip-calc-title" className="strip-calc__title">
          Strip vs. Hold Economic Calculator
        </h2>
        <p className="strip-calc__subtitle">
          Compare the upfront liquidity of stripping your stock into Principal Tokens (PT) and Epoch Coupons (EC)
          versus holding traditional underlying shares to maturity.
        </p>
      </div>

      {/* Inputs Card */}
      <div className="strip-calc__inputs-card">
        <div className="strip-calc__inputs-grid">
          {/* Share Quantity Field */}
          <div className="strip-calc__field">
            <label htmlFor="calc-shares-input" className="strip-calc__label font-mono">
              Share Quantity (Shares)
            </label>
            <div className="strip-calc__input-wrap">
              <input
                id="calc-shares-input"
                type="number"
                min="0"
                step="1"
                className="strip-calc__input"
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
            <div className="strip-calc__quick-btns">
              {[10, 50, 100, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="strip-calc__quick-btn font-mono"
                  onClick={() => setSharesInput(amt.toString())}
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Share Price Field */}
          <div className="strip-calc__field">
            <label htmlFor="calc-price-input" className="strip-calc__label font-mono">
              Current Share Price (USD)
            </label>
            <div className="strip-calc__input-wrap">
              <span className="strip-calc__prefix">$</span>
              <input
                id="calc-price-input"
                type="number"
                min="0"
                step="0.01"
                className="strip-calc__input strip-calc__input--has-prefix"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="100.00"
              />
            </div>
            <div className="strip-calc__quick-btns">
              {[50, 100, 175, 250].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="strip-calc__quick-btn font-mono"
                  onClick={() => setPriceInput(p.toFixed(2))}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Takeaway Banner */}
      <div className="strip-calc__takeaway" role="status">
        <span className="strip-calc__takeaway-icon">⚡</span>
        <p className="strip-calc__takeaway-text">
          <strong>Takeaway:</strong> {result.takeaway}
        </p>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="strip-calc__comparison-grid">
        {/* Strategy 1: Prism Strip */}
        <div className="strip-calc__strategy-card strip-calc__strategy-card--recommended">
          <div className="strip-calc__strategy-header">
            <div>
              <h3 className="strip-calc__strategy-name">Prism Strip Strategy</h3>
              <p className="strip-calc__strategy-desc">Bifurcate stock into PT & Sell ECs today</p>
            </div>
            <span className="strip-calc__badge strip-calc__badge--strip font-mono">
              Upfront Liquidity
            </span>
          </div>

          <div className="strip-calc__metrics-list font-mono">
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Cash Received Today (Day 1)</span>
              <span className="strip-calc__metric-val strip-calc__metric-val--highlight">
                {currencyFormatter.format(result.cashReceivedToday)}
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Retained Price Exposure (PT)</span>
              <span className="strip-calc__metric-val">
                {currencyFormatter.format(result.priceExposureRetained)}
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Coupon Face Value</span>
              <span className="strip-calc__metric-val strip-calc__metric-val--muted">
                {currencyFormatter.format(result.couponGrossFaceValue)}
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Discount for Immediacy</span>
              <span className="strip-calc__metric-val strip-calc__metric-val--muted">
                {currencyFormatter.format(result.discountPaidForLiquidity)} ({(assumptions.defaultCouponAuctionDiscount * 100).toFixed(0)}%)
              </span>
            </div>
          </div>

          <div className="strip-calc__summary-box">
            <span className="strip-calc__summary-label font-mono">Total Day-1 Realized Value</span>
            <span className="strip-calc__summary-val font-mono">
              {currencyFormatter.format(result.stripDayOneTotal)}
            </span>
          </div>
        </div>

        {/* Strategy 2: Traditional Hold */}
        <div className="strip-calc__strategy-card">
          <div className="strip-calc__strategy-header">
            <div>
              <h3 className="strip-calc__strategy-name">Traditional Hold Strategy</h3>
              <p className="strip-calc__strategy-desc">Hold underlying stock and await quarterly payouts</p>
            </div>
            <span className="strip-calc__badge strip-calc__badge--hold font-mono">
              Buy & Hold
            </span>
          </div>

          <div className="strip-calc__metrics-list font-mono">
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Cash Received Today (Day 1)</span>
              <span className="strip-calc__metric-val strip-calc__metric-val--muted">
                $0.00
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Underlying Stock Value Held</span>
              <span className="strip-calc__metric-val">
                {currencyFormatter.format(result.priceExposureRetained)}
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Future Dividends (Over 1-Yr)</span>
              <span className="strip-calc__metric-val">
                {currencyFormatter.format(result.futureDividendsExpected)}
              </span>
            </div>
            <div className="strip-calc__metric-row">
              <span className="strip-calc__metric-label">Dividend Timing Risk</span>
              <span className="strip-calc__metric-val strip-calc__metric-val--muted">
                Subject to Delay
              </span>
            </div>
          </div>

          <div className="strip-calc__summary-box">
            <span className="strip-calc__summary-label font-mono">Total Value at Maturity</span>
            <span className="strip-calc__summary-val font-mono">
              {currencyFormatter.format(result.holdTotalHorizon)}
            </span>
          </div>
        </div>
      </div>

      {/* Model Assumptions Section */}
      <div className="strip-calc__assumptions">
        <div className="strip-calc__assumptions-header">
          <h4 className="strip-calc__assumptions-title font-mono">
            Transparent Pricing Assumptions
          </h4>
          <span className="strip-calc__badge font-mono">
            {vaultData ? 'On-Chain Vault Synced' : 'Standard Baseline'}
          </span>
        </div>
        <div className="strip-calc__assumptions-grid font-mono">
          <div className="strip-calc__assumption-item">
            <span className="strip-calc__assumption-label">Horizon Duration:</span>
            <span className="strip-calc__assumption-val">{assumptions.horizonLabel}</span>
          </div>
          <div className="strip-calc__assumption-item">
            <span className="strip-calc__assumption-label">Declared Dividend / Epoch:</span>
            <span className="strip-calc__assumption-val">${assumptions.defaultDividendPerEpochUsd.toFixed(2)} / share</span>
          </div>
          <div className="strip-calc__assumption-item">
            <span className="strip-calc__assumption-label">Dutch Auction Discount:</span>
            <span className="strip-calc__assumption-val">{(assumptions.defaultCouponAuctionDiscount * 100).toFixed(1)}%</span>
          </div>
          <div className="strip-calc__assumption-item">
            <span className="strip-calc__assumption-label">PT Redemption Ratio:</span>
            <span className="strip-calc__assumption-val">1 PT : 1 Stock</span>
          </div>
        </div>
      </div>
    </section>
  );
};
