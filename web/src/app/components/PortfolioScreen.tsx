import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatStock,
  formatUsdc,
  claimDividend,
  formatTimestampToDate,
} from '../../chain/contracts';
import { decodeContractError } from '../../chain/errors';
import './PortfolioScreen.css';

export const PortfolioScreen: React.FC = () => {
  const {
    walletClient,
    publicClient,
    vaultData,
    userBalances,
    refreshData,
    addToast,
    updateToast,
  } = useApp();

  const [isClaimingEpochId, setIsClaimingEpochId] = useState<number | null>(null);

  const now = vaultData?.latestBlockTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const epochs = vaultData?.epochs ?? [];

  // Calculate pro-rata payout for each epoch
  // Vault math: payout = (amount * epoch.totalFundedUSDC) / epoch.fundedSupply
  const epochRows = epochs.map((ep) => {
    const bal = userBalances?.couponBalances[ep.epochId] ?? 0n;
    let claimableUsdc = 0n;

    if (ep.funded && ep.fundedSupply > 0n && bal > 0n) {
      claimableUsdc = (bal * ep.totalFundedUSDC) / ep.fundedSupply;
    }

    let statusType: 'live' | 'funded' | 'settled' | 'expired';
    let statusLabel: string;

    if (ep.funded) {
      if (bal > 0n) {
        statusType = 'funded';
        statusLabel = 'FUNDED (CLAIMABLE)';
      } else {
        statusType = 'settled';
        statusLabel = 'SETTLED';
      }
    } else {
      if (ep.isLive !== undefined) {
        if (ep.isLive) {
          statusType = 'live';
          statusLabel = 'LIVE';
        } else if (ep.isAwaitingFunding) {
          statusType = 'expired';
          statusLabel = 'AWAITING FUNDING';
        } else if (ep.isDefaulted) {
          statusType = 'expired';
          statusLabel = 'DEFAULTED';
        } else if (ep.exDate > now) {
          statusType = 'live';
          statusLabel = 'LIVE';
        } else {
          statusType = 'expired';
          statusLabel = 'EXPIRED (UNFUNDED)';
        }
      } else {
        if (ep.exDate > now) {
          statusType = 'live';
          statusLabel = 'LIVE';
        } else {
          statusType = 'expired';
          statusLabel = 'EXPIRED (UNFUNDED)';
        }
      }
    }

    return {
      ...ep,
      couponBalance: bal,
      claimableUsdc,
      statusType,
      statusLabel,
    };
  });

  const totalClaimableUSDC = epochRows.reduce((sum, r) => sum + r.claimableUsdc, 0n);

  const handleClaim = async (epochId: number, amount: bigint) => {
    setIsClaimingEpochId(epochId);
    const toastId = addToast({
      type: 'pending',
      title: 'Claiming Dividend',
      message: `Burning ${formatStock(amount)} coupons to redeem pro-rata USDC...`,
    });

    try {
      const hash = await claimDividend(walletClient, epochId, amount);
      updateToast(toastId, { message: 'Transferring USDC from vault...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Dividend Claimed',
        message: `Claimed USDC payout for Epoch ${epochId}.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Claim Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsClaimingEpochId(null);
    }
  };

  return (
    <div className="prism-portfolio-screen font-mono">
      {/* Overview Cards */}
      <div className="prism-portfolio-screen__summary-grid">
        <section className="prism-card prism-summary-card">
          <span className="prism-summary-card__label">TOTAL CLAIMABLE DIVIDENDS</span>
          <strong className="prism-summary-card__value prism-summary-card__value--highlight">
            ${formatUsdc(totalClaimableUSDC)} <small>USDC</small>
          </strong>
          <span className="prism-summary-card__sub">From funded cycle epochs ready for redemption</span>
        </section>

        <section className="prism-card prism-summary-card">
          <span className="prism-summary-card__label">PRINCIPAL TOKEN HOLDINGS</span>
          <strong className="prism-summary-card__value">
            {userBalances ? formatStock(userBalances.ptBalance) : '0.00'} <small>PT-STOCK</small>
          </strong>
          <span className="prism-summary-card__sub">Perpetual underlying asset collateral claim</span>
        </section>

        <section className="prism-card prism-summary-card">
          <span className="prism-summary-card__label">STABLECOIN CASH BALANCE</span>
          <strong className="prism-summary-card__value">
            ${userBalances ? formatUsdc(userBalances.usdcBalance) : '0.00'} <small>USDC</small>
          </strong>
          <span className="prism-summary-card__sub">Liquid MockUSDC balance in wallet</span>
        </section>
      </div>

      {/* Epochs Dividend Entitlement Table */}
      <section className="prism-card" aria-labelledby="portfolio-epochs-heading">
        <div className="prism-card__header">
          <span className="prism-card__step font-mono">PORTFOLIO REDEMPTION</span>
          <h2 id="portfolio-epochs-heading" className="prism-card__title">
            Quarterly Coupon Entitlements & Pro-Rata Claims
          </h2>
        </div>

        <p className="prism-card__desc">
          When an epoch is funded prior to ex-date, the vault snapshots <code>fundedSupply</code>. Coupon holders burn
          their vouchers to redeem their exact mathematical entitlement in USDC.
        </p>

        <div className="prism-table-container">
          <table className="prism-table font-mono" aria-label="Epochs Portfolio Table">
            <thead>
              <tr>
                <th scope="col">CYCLE EPOCH</th>
                <th scope="col">EX-DATE / PAY-DATE</th>
                <th scope="col">YOUR COUPONS</th>
                <th scope="col">DIVIDEND (GROSS / TAX / NET)</th>
                <th scope="col">STATUS</th>
                <th scope="col">POOL FUNDED (USDC)</th>
                <th scope="col">YOUR EXACT PAYOUT</th>
                <th scope="col">EXECUTION</th>
              </tr>
            </thead>
            <tbody>
              {epochRows.map((row) => {
                const exStr = formatTimestampToDate(row.exDate);
                const payStr = formatTimestampToDate(row.payDate);

                const isBusy = isClaimingEpochId === row.epochId;
                const canClaim = row.funded && row.couponBalance > 0n;

                return (
                  <tr key={row.epochId}>
                    <td>
                      <strong>Quarterly Epoch {row.epochId}</strong>
                    </td>
                    <td>
                      <span>Ex: {exStr}</span> &middot; <span>Pay: {payStr}</span>
                    </td>
                    <td>
                      <strong>{formatStock(row.couponBalance)} EC</strong>
                    </td>
                    <td>
                      {row.grossUsdcPerShare && row.grossUsdcPerShare > 0n ? (
                        <div style={{ fontSize: '0.82rem', lineHeight: 1.3 }}>
                          <div>Gross: ${formatUsdc(row.grossUsdcPerShare)}</div>
                          <div style={{ color: 'var(--text-muted, #888)' }}>
                            Tax: {((row.withholdingBps ?? 0) / 100).toFixed(1)}%
                          </div>
                          <div style={{ fontWeight: 600 }}>
                            Net: ${formatUsdc(row.netUsdcPerShare ?? row.grossUsdcPerShare)}
                          </div>
                        </div>
                      ) : (
                        <span className="prism-tag prism-tag--neutral">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`prism-tag prism-tag--${row.statusType}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td>
                      {row.funded ? (
                        <span>${formatUsdc(row.totalFundedUSDC)} USDC</span>
                      ) : (
                        <span className="prism-tag prism-tag--neutral">—</span>
                      )}
                    </td>
                    <td>
                      <strong className="prism-payout-val">
                        ${formatUsdc(row.claimableUsdc)} USDC
                      </strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="prism-btn prism-btn--primary prism-btn--sm"
                        onClick={() => handleClaim(row.epochId, row.couponBalance)}
                        disabled={!canClaim || isBusy}
                      >
                        {isBusy
                          ? 'CLAIMING...'
                          : !row.funded
                            ? 'UNFUNDED'
                            : row.couponBalance === 0n
                              ? 'NO COUPONS'
                              : 'CLAIM USDC'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
