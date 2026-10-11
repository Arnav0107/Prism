import React, { useState, useEffect } from 'react';
import { Section, Rule, Label, Badge } from '../ui';
import './AuctionSection.css';

const START_PRICE = 4.50;
const FLOOR_PRICE = 3.00;
const DURATION_SECONDS = 3600; // 1 hour auction window

export const AuctionSection: React.FC = () => {
  // Simulate an active auction with 42 minutes elapsed (~2520s)
  const [elapsed, setElapsed] = useState<number>(1440); // 24 min elapsed
  const [isLive, setIsLive] = useState<boolean>(true);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= DURATION_SECONDS) return 0;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Current price formula from PrismAuction.sol:
  // price = startPrice - ((elapsed * (startPrice - floorPrice)) / duration)
  const currentPrice = START_PRICE - (elapsed / DURATION_SECONDS) * (START_PRICE - FLOOR_PRICE);
  const remainingSec = Math.max(0, DURATION_SECONDS - elapsed);
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingSecRem = remainingSec % 60;

  // SVG coordinates:
  // width: 500, height: 200, padding: { left: 50, right: 30, top: 25, bottom: 35 }
  const plotW = 420;
  const plotH = 140;
  const originX = 50;
  const originY = 25;

  const startX = originX;
  const startY = originY; // highest price at top
  const endX = originX + plotW;
  const endY = originY + plotH; // lowest price at bottom

  const curX = originX + (elapsed / DURATION_SECONDS) * plotW;
  const curY = originY + ((START_PRICE - currentPrice) / (START_PRICE - FLOOR_PRICE)) * plotH;

  return (
    <Section
      id="auction"
      number="03"
      category="PRICE DISCOVERY"
      heading="Dividend Dutch Auction"
      lead="A continuous, descending-price clearing mechanism for coupon liquidity prior to ex-date settlement."
    >
      <div className="prism-auction__grid">
        {/* Left: Interactive Graph */}
        <div className="prism-auction__chart-panel">
          <div className="prism-auction__panel-header">
            <span className="font-mono prism-auction__panel-title">
              FIG. 2 — LINEAR PRICE DECAY PROFILE
            </span>
            <Badge variant="accent">ILLUSTRATIVE</Badge>
          </div>

          <div className="prism-auction__svg-container">
            <svg
              className="prism-auction__svg"
              viewBox="0 0 500 210"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Dutch Auction price decay curve chart"
            >
              {/* Axes and Grid */}
              <line x1="50" y1="25" x2="50" y2="165" stroke="var(--color-border)" strokeWidth="1" />
              <line x1="50" y1="165" x2="470" y2="165" stroke="var(--color-border)" strokeWidth="1" />

              {/* Horizontal Reference Lines */}
              <line x1="50" y1="25" x2="470" y2="25" stroke="var(--color-border-subtle)" strokeDasharray="2 3" />
              <line x1="50" y1="95" x2="470" y2="95" stroke="var(--color-border-subtle)" strokeDasharray="2 3" />
              <line x1="50" y1="165" x2="470" y2="165" stroke="var(--color-border-subtle)" strokeDasharray="2 3" />

              {/* Y Axis Labels */}
              <text x="42" y="29" textAnchor="end" className="prism-auction__axis-text font-mono">$4.50</text>
              <text x="42" y="99" textAnchor="end" className="prism-auction__axis-text font-mono">$3.75</text>
              <text x="42" y="169" textAnchor="end" className="prism-auction__axis-text font-mono">$3.00</text>

              {/* X Axis Labels */}
              <text x="50" y="185" textAnchor="start" className="prism-auction__axis-text font-mono">T=0</text>
              <text x="260" y="185" textAnchor="middle" className="prism-auction__axis-text font-mono">T=30m</text>
              <text x="470" y="185" textAnchor="end" className="prism-auction__axis-text font-mono">T=60m</text>

              {/* Inactive decay path */}
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke="var(--color-border)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* Active decay line up to current time */}
              <line
                x1={startX}
                y1={startY}
                x2={curX}
                y2={curY}
                stroke="var(--color-vermilion)"
                strokeWidth="2"
              />

              {/* Current Point Marker */}
              <circle
                cx={curX}
                cy={curY}
                r="4.5"
                fill="var(--color-surface)"
                stroke="var(--color-vermilion)"
                strokeWidth="2"
              />

              {/* Guide drop-lines from current point */}
              <line
                x1={curX}
                y1={curY}
                x2={curX}
                y2="165"
                stroke="var(--color-vermilion)"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />

              {/* Floating current price callout */}
              <rect
                x={Math.min(Math.max(curX - 42, 55), 385)}
                y={Math.max(curY - 28, 6)}
                width="84"
                height="20"
                fill="var(--color-surface)"
                stroke="var(--color-vermilion)"
                strokeWidth="1"
              />
              <text
                x={Math.min(Math.max(curX, 97), 427)}
                y={Math.max(curY - 14, 20)}
                textAnchor="middle"
                className="prism-auction__callout-text font-mono"
              >
                ${currentPrice.toFixed(4)}
              </text>
            </svg>
          </div>

          <div className="prism-auction__panel-footer font-mono">
            <span>DECAY RATE: -$0.0250 / MINUTE</span>
            <span>MODEL: CONTINUOUS BLOCK-TIME PRICING</span>
          </div>
        </div>

        {/* Right: Live Ticker & Order Card */}
        <div className="prism-auction__ticker-panel">
          <div className="prism-auction__panel-header">
            <span className="font-mono prism-auction__panel-title">
              LIVE LOT SPECIFICATION
            </span>
            <span className="prism-auction__live-indicator font-mono">
              <span className={`prism-auction__live-dot ${isLive ? 'prism-auction__live-dot--active' : ''}`}></span>
              {isLive ? 'STREAMING' : 'PAUSED'}
            </span>
          </div>

          <div className="prism-auction__quote-display">
            <div className="prism-auction__quote-label font-mono">CURRENT CLEARING PRICE</div>
            <div className="prism-auction__quote-price font-mono">
              <span className="prism-auction__quote-currency">$</span>
              <span className="prism-auction__quote-value">{currentPrice.toFixed(4)}</span>
              <span className="prism-auction__quote-unit">USDC / EC</span>
            </div>
            <div className="prism-auction__quote-meta font-mono">
              <span>TIME REMAINING: {String(remainingMin).padStart(2, '0')}:{String(remainingSecRem).padStart(2, '0')}</span>
              <button
                type="button"
                className="prism-auction__pause-btn"
                onClick={() => setIsLive(!isLive)}
                aria-pressed={isLive}
              >
                [{isLive ? 'PAUSE' : 'RESUME'}]
              </button>
            </div>
          </div>

          <Rule variant="subtle" />

          <dl className="prism-auction__metrics font-mono">
            <div className="prism-auction__metric-row">
              <dt>AUCTION ID</dt>
              <dd>#0001 (PRISM-AUCTION-SOL)</dd>
            </div>
            <div className="prism-auction__metric-row">
              <dt>OFFERED ASSET</dt>
              <dd>10,000 EC (Q4-2026)</dd>
            </div>
            <div className="prism-auction__metric-row">
              <dt>START PRICE</dt>
              <dd>${START_PRICE.toFixed(2)} USDC</dd>
            </div>
            <div className="prism-auction__metric-row">
              <dt>FLOOR PRICE</dt>
              <dd>${FLOOR_PRICE.toFixed(2)} USDC</dd>
            </div>
            <div className="prism-auction__metric-row">
              <dt>TOTAL DURATION</dt>
              <dd>3,600 SECONDS (1 HOUR)</dd>
            </div>
            <div className="prism-auction__metric-row">
              <dt>SETTLEMENT ASSET</dt>
              <dd>MockUSDC (6 DECIMALS)</dd>
            </div>
          </dl>

          <div className="prism-auction__notice">
            <Label variant="muted">ON-CHAIN SETTLEMENT RULES</Label>
            <p className="prism-auction__notice-text font-mono">
              Prices decay strictly linearly per second according to block.timestamp. Buyers fill partially or in full at the current block price. Escrowed coupons are refunded if the auction reaches duration without full execution.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
};
