import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatUnits } from 'viem';
import {
  fetchEpochMarketData,
  fetchReferencePrice,
  formatUsdcPrice,
  formatStock,
} from '../../chain/contracts';
import './DividendCurveScreen.css';

interface EpochMarketRow {
  epochId: number;
  exDate: bigint;
  clearingPrice: bigint;
  volume: bigint;
  funded: boolean;
}

export const DividendCurveScreen: React.FC = () => {
  const { publicClient, vaultData } = useApp();

  // On-chain reference price default with user typing override
  const [referencePriceInput, setReferencePriceInput] = useState('100.00');
  const [hasUserEditedRefPrice, setHasUserEditedRefPrice] = useState(false);
  const [marketRows, setMarketRows] = useState<EpochMarketRow[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(true);

  const referencePriceNum = Math.max(0.01, Number(referencePriceInput) || 100);

  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      // 1. Fetch on-chain reference price if user hasn't overridden
      try {
        const refData = await fetchReferencePrice(publicClient);
        if (refData && refData.price > 0n && !hasUserEditedRefPrice && !isCancelled) {
          const formatted = (Number(refData.price) / 1e6).toFixed(2);
          setReferencePriceInput(formatted);
        }
      } catch {
        // Fallback to default
      }

      if (!vaultData) return;
      setIsLoadingRows(true);
      const rows: EpochMarketRow[] = [];

      for (const ep of vaultData.epochs) {
        try {
          const { lastClearingPrice, cumulativeVolume } = await fetchEpochMarketData(
            publicClient,
            ep.epochId
          );
          rows.push({
            epochId: ep.epochId,
            exDate: ep.exDate,
            clearingPrice: lastClearingPrice,
            volume: cumulativeVolume,
            funded: ep.funded,
          });
        } catch {
          rows.push({
            epochId: ep.epochId,
            exDate: ep.exDate,
            clearingPrice: 0n,
            volume: 0n,
            funded: ep.funded,
          });
        }
      }

      if (!isCancelled) {
        setMarketRows(rows);
        setIsLoadingRows(false);
      }
    };

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [publicClient, vaultData, hasUserEditedRefPrice]);

  const curveData = useMemo(() => {
    return marketRows.map((r) => {
      const priceNum = Number(formatUnits(r.clearingPrice, 6));
      // Implied yield = price / reference
      const impliedYieldPct = (priceNum / referencePriceNum) * 100;
      const annualizedPct = impliedYieldPct * 4;

      return {
        ...r,
        priceNum,
        impliedYieldPct,
        annualizedPct,
      };
    });
  }, [marketRows, referencePriceNum]);

  const maxPriceInSet = Math.max(2.5, ...curveData.map((d) => d.priceNum));

  return (
    <div className="prism-curve-screen font-mono">
      {/* Top Banner: Reference Stock Price Assumption */}
      <section className="prism-card prism-curve-screen__assumption-card" aria-labelledby="curve-assumption-heading">
        <div className="prism-card__header">
          <span className="prism-card__step font-mono">ASSUMPTION INPUT</span>
          <h2 id="curve-assumption-heading" className="prism-card__title">
            Term Structure & Implied Yield
          </h2>
        </div>

        <p className="prism-card__desc">
          Prism Vault is strictly oracle-free. It does not fetch external stock prices or off-chain data feeds. To
          interpret the clearing prices of discrete Epoch Coupons as implied yield percentages, enter your reference
          stock price assumption below.
        </p>

        <div className="prism-curve-screen__assumption-row">
          <div className="prism-form-group">
            <label htmlFor="ref-stock-input">
              <span className="prism-tag prism-tag--accent">ASSUMPTION</span> REFERENCE STOCK SPOT PRICE (USDC)
            </label>
            <div className="prism-input-wrapper">
              <span className="prism-curve-screen__currency-prefix">$</span>
              <input
                id="ref-stock-input"
                type="number"
                step="1"
                min="0.1"
                className="prism-input font-mono"
                value={referencePriceInput}
                onChange={(e) => {
                  setHasUserEditedRefPrice(true);
                  setReferencePriceInput(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="prism-formula-box">
            <span className="prism-formula-box__title">IMPLIED YIELD FORMULA:</span>
            <code>Implied Yield = (Coupon Clearing Price / Reference Spot Price) × 100%</code>
            <span className="prism-formula-box__sub">
              Annualized Yield = Implied Quarterly Yield × 4
            </span>
          </div>
        </div>
      </section>

      {/* Graphical Yield Curve SVG Visualization */}
      <section className="prism-card" aria-labelledby="chart-heading">
        <div className="prism-card__header">
          <span className="prism-card__step font-mono">TERM STRUCTURE CURVE</span>
          <h2 id="chart-heading" className="prism-card__title">
            Quarterly Clearing Price & Yield Curve (VWAP is Informational Only)
          </h2>
        </div>

        <p className="prism-card__desc">
          Volume-Weighted Average Price (VWAP) is computed from historical Dutch auction fills for informational
          monitoring only. It does not represent an unmanipulable on-chain oracle.
        </p>

        <div className="prism-curve-chart" aria-hidden="true">
          <svg viewBox="0 0 600 220" className="prism-curve-chart__svg">
            {/* Grid Lines */}
            <line x1="50" y1="20" x2="560" y2="20" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
            <line x1="50" y1="90" x2="560" y2="90" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
            <line x1="50" y1="160" x2="560" y2="160" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
            <line x1="50" y1="180" x2="560" y2="180" stroke="var(--color-border)" strokeWidth="1" />
            <line x1="50" y1="20" x2="50" y2="180" stroke="var(--color-border)" strokeWidth="1" />

            {/* Y Axis Labels */}
            <text x="42" y="24" textAnchor="end" className="prism-curve-chart__axis-text">
              ${maxPriceInSet.toFixed(2)}
            </text>
            <text x="42" y="94" textAnchor="end" className="prism-curve-chart__axis-text">
              ${(maxPriceInSet / 2).toFixed(2)}
            </text>
            <text x="42" y="164" textAnchor="end" className="prism-curve-chart__axis-text">
              $0.00
            </text>

            {/* Curve Points */}
            {curveData.map((d, idx) => {
              const x = 110 + idx * 130;
              const ratio = maxPriceInSet > 0 ? d.priceNum / maxPriceInSet : 0;
              const y = 160 - ratio * 140;

              return (
                <g key={d.epochId}>
                  {/* Vertical hairline */}
                  <line x1={x} y1="20" x2={x} y2="180" stroke="var(--color-border-subtle)" strokeDasharray="2 2" />

                  {/* Marker Dot */}
                  <circle cx={x} cy={y} r="4" fill="var(--color-vermilion)" />

                  {/* Label */}
                  <text x={x} y={y - 10} textAnchor="middle" className="prism-curve-chart__point-text font-mono">
                    ${d.priceNum.toFixed(2)}
                  </text>
                  <text x={x} y={198} textAnchor="middle" className="prism-curve-chart__axis-text font-mono">
                    Q{d.epochId}
                  </text>
                </g>
              );
            })}

            {/* Connecting Line */}
            {curveData.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--color-vermilion)"
                strokeWidth="1.5"
                points={curveData
                  .map((d, idx) => {
                    const x = 110 + idx * 130;
                    const ratio = maxPriceInSet > 0 ? d.priceNum / maxPriceInSet : 0;
                    const y = 160 - ratio * 140;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            )}
          </svg>
        </div>
      </section>

      {/* Epoch Market Data Table */}
      <section className="prism-card" aria-labelledby="market-data-heading">
        <div className="prism-card__header">
          <span className="prism-card__step font-mono">ON-CHAIN EVIDENCE</span>
          <h2 id="market-data-heading" className="prism-card__title">
            Historical Clearing & Volume Per Epoch
          </h2>
        </div>

        <div className="prism-table-container">
          <table className="prism-table font-mono" aria-label="Epoch Market Clearing Data">
            <thead>
              <tr>
                <th scope="col">CYCLE EPOCH</th>
                <th scope="col">EX-DIVIDEND DATE</th>
                <th scope="col">VWAP CLEARING PRICE (INFORMATIONAL ONLY)</th>
                <th scope="col">CUMULATIVE VOLUME</th>
                <th scope="col">IMPLIED YIELD</th>
                <th scope="col">ANNUALIZED</th>
                <th scope="col">DIVIDEND STATUS</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingRows ? (
                <tr>
                  <td colSpan={7} className="prism-table__loading">
                    Reading on-chain clearing data...
                  </td>
                </tr>
              ) : (
                curveData.map((r) => {
                  const exDateStr = new Date(Number(r.exDate) * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={r.epochId}>
                      <td>
                        <strong>Quarterly Epoch {r.epochId}</strong>
                      </td>
                      <td>{exDateStr}</td>
                      <td>
                        {r.clearingPrice > 0n ? (
                          <span>${formatUsdcPrice(r.clearingPrice)} USDC</span>
                        ) : (
                          <span className="prism-tag prism-tag--neutral">NO TRADES YET</span>
                        )}
                      </td>
                      <td>{formatStock(r.volume)} EC</td>
                      <td>
                        <strong className="prism-yield-val">
                          {r.clearingPrice > 0n ? `${r.impliedYieldPct.toFixed(2)}%` : '—'}
                        </strong>
                      </td>
                      <td>
                        <strong className="prism-yield-val">
                          {r.clearingPrice > 0n ? `${r.annualizedPct.toFixed(2)}%` : '—'}
                        </strong>
                      </td>
                      <td>
                        <span className={`prism-tag ${r.funded ? 'prism-tag--success' : 'prism-tag--accent'}`}>
                          {r.funded ? 'FUNDED' : 'UNFUNDED'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
