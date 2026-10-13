import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  parseStock,
  formatStock,
  approveStock,
  depositShares,
  recombineShares,
  redeemPrincipal,
  mintMockTokens,
  computeDepositState,
  computeRecombineState,
  formatBalanceStateValue,
  DEPLOYED_ADDRESSES,
} from '../../chain/contracts';
import { decodeContractError } from '../../chain/errors';
import './SplitScreen.css';

export const SplitScreen: React.FC = () => {
  const {
    walletClient,
    publicClient,
    accountAddress,
    vaultData,
    userBalances,
    balanceStatus,
    balanceErrorMessage,
    retryLoad,
    refreshData,
    addToast,
    updateToast,
  } = useApp();

  const [depositInput, setDepositInput] = useState('10');
  const [recombineInput, setRecombineInput] = useState('1');
  const [redeemInput, setRedeemInput] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBalanceLoaded = balanceStatus === 'loaded';
  const parsedDeposit = parseStock(depositInput);
  const stockBalance = userBalances?.stockBalance ?? 0n;
  const stockAllowance = userBalances?.stockAllowanceVault ?? 0n;
  const ptBalance = userBalances?.ptBalance ?? 0n;

  const needsApproval = isBalanceLoaded && parsedDeposit > 0n && stockAllowance < parsedDeposit;

  // Recombine eligibility check:
  // Requires PT >= recombineAmount and EC(i) >= recombineAmount for all live epochs
  const parsedRecombine = parseStock(recombineInput);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const missingCouponsForRecombine: { epochId: number; held: bigint }[] = [];
  if (isBalanceLoaded && vaultData && userBalances && parsedRecombine > 0n) {
    for (const epoch of vaultData.epochs) {
      const isLive = !epoch.funded && epoch.exDate > now;
      if (isLive) {
        const held = userBalances.couponBalances[epoch.epochId] ?? 0n;
        if (held < parsedRecombine) {
          missingCouponsForRecombine.push({ epochId: epoch.epochId, held });
        }
      }
    }
  }

  const canRecombine =
    isBalanceLoaded &&
    parsedRecombine > 0n &&
    ptBalance >= parsedRecombine &&
    missingCouponsForRecombine.length === 0;

  // Redeem eligibility check:
  // Requires that no future live epochs remain
  const parsedRedeem = parseStock(redeemInput);
  const hasFutureEpochs =
    vaultData?.epochs.some((e) => !e.funded && e.exDate > now) ?? true;

  const handleMintStock = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Minting Test Stock',
      message: 'Minting 100 mSTOCK to your account...',
    });

    try {
      const hash = await mintMockTokens(walletClient, 'stock', accountAddress, parseStock('100'));
      updateToast(toastId, { message: 'Waiting for block inclusion...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, { type: 'success', title: 'Test Stock Minted', message: 'Received 100 mSTOCK.' });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Mint Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Approving mSTOCK',
      message: `Approving ${depositInput} mSTOCK for PrismVault...`,
    });

    try {
      const hash = await approveStock(walletClient, parsedDeposit);
      updateToast(toastId, { message: 'Waiting for block inclusion...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, { type: 'success', title: 'mSTOCK Approved', message: 'Allowance updated successfully.' });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Approval Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeposit = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Depositing Shares',
      message: `Bifurcating ${depositInput} shares into PT & Epoch Coupons...`,
    });

    try {
      const hash = await depositShares(walletClient, parsedDeposit);
      updateToast(toastId, { message: 'Minting synthetic tokens on-chain...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Deposit Successful',
        message: `Minted ${depositInput} PT and matching quarterly coupons.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Deposit Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecombine = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Recombining Tokens',
      message: `Burning ${recombineInput} PT and live coupons to recover stock...`,
    });

    try {
      const hash = await recombineShares(walletClient, parsedRecombine);
      updateToast(toastId, { message: 'Reconstituting underlying equity...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Recombine Complete',
        message: `Unlocked ${recombineInput} mSTOCK shares from vault.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Recombine Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeem = async () => {
    setIsSubmitting(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Redeeming Principal',
      message: `Redeeming ${redeemInput} PT post-maturity...`,
    });

    try {
      const hash = await redeemPrincipal(walletClient, parsedRedeem);
      updateToast(toastId, { message: 'Unlocking mature principal collateral...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Principal Redeemed',
        message: `Redeemed ${redeemInput} mSTOCK shares.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: 'Redemption Failed',
        message: decodeContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBalanceValue = (val: bigint | undefined, formatter: (v: bigint) => string) => {
    return formatBalanceStateValue(balanceStatus, val, formatter);
  };

  const depositState = computeDepositState({
    balanceStatus,
    stockBalance,
    parsedDeposit,
    needsApproval,
    isSubmitting,
  });

  const recombineState = computeRecombineState({
    balanceStatus,
    canRecombine,
    isSubmitting,
  });

  const getRedeemButtonText = () => {
    if (balanceStatus === 'loading') return 'LOADING BALANCES...';
    if (balanceStatus === 'not-deployed') return 'CONTRACTS NOT DEPLOYED';
    if (balanceStatus === 'error') return 'ERROR LOADING BALANCES';
    if (hasFutureEpochs) return 'FUTURE EPOCHS REMAIN';
    if (ptBalance < parsedRedeem) return 'INSUFFICIENT PT';
    if (parsedRedeem === 0n) return 'ENTER AMOUNT';
    if (isSubmitting) return 'REDEEMING...';
    return 'REDEEM PRINCIPAL';
  };

  const isRedeemDisabled =
    isSubmitting ||
    balanceStatus !== 'loaded' ||
    hasFutureEpochs ||
    ptBalance < parsedRedeem ||
    parsedRedeem === 0n;

  return (
    <div className="prism-split-screen font-mono">
      {(balanceStatus === 'not-deployed' || balanceStatus === 'error') && (
        <div className="prism-alert-banner font-mono" role="alert">
          <div className="prism-alert-banner__content">
            <span className="prism-alert-banner__icon">⚠</span>
            <span>
              {balanceErrorMessage || 'Contracts not found on this chain — run scripts/deploy-local'}
            </span>
          </div>
          <button
            type="button"
            className="prism-btn prism-btn--secondary prism-alert-banner__retry"
            onClick={() => void retryLoad()}
          >
            RETRY
          </button>
        </div>
      )}

      <div className="prism-split-screen__grid">
        {/* Left Column: Deposit & Bifurcate */}
        <section className="prism-card" aria-labelledby="deposit-heading">
          <div className="prism-card__header">
            <span className="prism-card__step font-mono">ACTION 01</span>
            <h2 id="deposit-heading" className="prism-card__title">
              Deposit & Strip Equity
            </h2>
          </div>

          <p className="prism-card__desc">
            Escrow underlying MockStock into PrismVault to bifurcate ownership rights 1:1 into perpetual
            Principal Tokens (PT) and discrete quarterly dividend claim vouchers (EpochCoupons).
          </p>

          <div className="prism-form-group">
            <div className="prism-form-group__label-row">
              <label htmlFor="deposit-amount-input">AMOUNT (mSTOCK)</label>
              <div className="prism-form-group__actions">
                <span className="prism-form-group__balance">
                  AVAILABLE: {formatBalanceValue(stockBalance, formatStock)}
                </span>
                <button
                  type="button"
                  className="prism-faucet-btn font-mono"
                  onClick={handleMintStock}
                  disabled={isSubmitting || balanceStatus === 'not-deployed'}
                  title="Mint 100 free testnet stock tokens"
                >
                  + FAUCET (MINT 100)
                </button>
              </div>
            </div>

            <div className="prism-input-wrapper">
              <input
                id="deposit-amount-input"
                type="number"
                step="0.1"
                min="0"
                className="prism-input font-mono"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="prism-input__max-btn"
                onClick={() => setDepositInput(formatStock(stockBalance))}
              >
                MAX
              </button>
            </div>
          </div>

          <div className="prism-callout">
            <div className="prism-callout__row">
              <span>MINTING OUTCOME:</span>
              <strong className="prism-callout__val">+{depositInput || '0'} PT</strong>
            </div>
            <div className="prism-callout__row">
              <span>COUPON OUTCOME:</span>
              <strong className="prism-callout__val">
                +{depositInput || '0'} EC (for Epochs 1..{vaultData?.epochCount || 4})
              </strong>
            </div>
          </div>

          <div className="prism-btn-stack">
            <button
              type="button"
              className="prism-btn prism-btn--primary"
              onClick={needsApproval ? handleApprove : handleDeposit}
              disabled={depositState.disabled}
            >
              {depositState.buttonText}
            </button>
          </div>
        </section>

        {/* Right Column: Recombine & Redeem */}
        <div className="prism-split-screen__right-col">
          {/* Recombine Box */}
          <section className="prism-card" aria-labelledby="recombine-heading">
            <div className="prism-card__header">
              <span className="prism-card__step font-mono">ACTION 02</span>
              <h2 id="recombine-heading" className="prism-card__title">
                Recombine Package
              </h2>
            </div>

            <p className="prism-card__desc">
              Burn 1.0 PT alongside 1.0 EpochCoupon for each unexpired, unfunded cycle epoch to reconstitute 1.0
              underlying share immediately with zero haircut.
            </p>

            <div className="prism-form-group">
              <div className="prism-form-group__label-row">
                <label htmlFor="recombine-amount-input">AMOUNT TO RECOMBINE</label>
                <span className="prism-form-group__balance">
                  PT HELD: {formatBalanceValue(ptBalance, formatStock)}
                </span>
              </div>

              <input
                id="recombine-amount-input"
                type="number"
                step="0.1"
                min="0"
                className="prism-input font-mono"
                value={recombineInput}
                onChange={(e) => setRecombineInput(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Plain Eligibility Messages */}
            {missingCouponsForRecombine.length > 0 && (
              <div className="prism-warning-box">
                {missingCouponsForRecombine.map((m) => (
                  <div key={m.epochId}>
                    Epoch {m.epochId} coupon required: you hold {formatStock(m.held)}.
                  </div>
                ))}
              </div>
            )}

            {balanceStatus === 'loaded' && ptBalance < parsedRecombine && parsedRecombine > 0n && (
              <div className="prism-warning-box">
                Principal Token required: you hold {formatStock(ptBalance)}, requested {recombineInput}.
              </div>
            )}

            <button
              type="button"
              className="prism-btn prism-btn--secondary"
              onClick={handleRecombine}
              disabled={recombineState.disabled}
            >
              {recombineState.buttonText}
            </button>
          </section>

          {/* Redeem Box */}
          <section className="prism-card" aria-labelledby="redeem-heading">
            <div className="prism-card__header">
              <span className="prism-card__step font-mono">ACTION 03</span>
              <h2 id="redeem-heading" className="prism-card__title">
                Redeem Principal (Post-Maturity)
              </h2>
            </div>

            <p className="prism-card__desc">
              After all scheduled quarterly epochs have matured past their ex-dividend date, coupons are no
              longer required. Redeem PT 1:1 for underlying MockStock.
            </p>

            <div className="prism-form-group">
              <div className="prism-form-group__label-row">
                <label htmlFor="redeem-amount-input">AMOUNT (PT)</label>
                <span className="prism-form-group__balance">
                  PT HELD: {formatBalanceValue(ptBalance, formatStock)}
                </span>
              </div>

              <input
                id="redeem-amount-input"
                type="number"
                step="0.1"
                min="0"
                className="prism-input font-mono"
                value={redeemInput}
                onChange={(e) => setRedeemInput(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {balanceStatus === 'loaded' && hasFutureEpochs && (
              <div className="prism-info-box">
                Active future epochs remain unexpired. Principal is locked until all epochs reach maturity. Use
                Recombine if you hold corresponding coupons.
              </div>
            )}

            <button
              type="button"
              className="prism-btn prism-btn--secondary"
              onClick={handleRedeem}
              disabled={isRedeemDisabled}
            >
              {getRedeemButtonText()}
            </button>
          </section>
        </div>
      </div>

      {/* Current Strip Inventory Table */}
      <section className="prism-card prism-split-screen__inventory" aria-labelledby="inv-heading">
        <div className="prism-card__header">
          <span className="prism-card__step font-mono">INVENTORY</span>
          <h2 id="inv-heading" className="prism-card__title">
            Your Bifurcated Asset Holdings
          </h2>
        </div>

        <div className="prism-table-container">
          <table className="prism-table font-mono" aria-label="Holdings table">
            <thead>
              <tr>
                <th scope="col">ASSET CLASS</th>
                <th scope="col">IDENTIFIER</th>
                <th scope="col">CONTRACT</th>
                <th scope="col">BALANCE</th>
                <th scope="col">STATUS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Principal Token</td>
                <td>PT-STOCK</td>
                <td className="prism-table__addr" title={DEPLOYED_ADDRESSES.PrincipalToken}>
                  {DEPLOYED_ADDRESSES.PrincipalToken.slice(0, 8)}...
                </td>
                <td><strong>{formatBalanceValue(ptBalance, formatStock)}</strong></td>
                <td><span className="prism-tag prism-tag--accent">PERPETUAL</span></td>
              </tr>
              {vaultData?.epochs.map((ep) => {
                const bal = userBalances?.couponBalances[ep.epochId] ?? 0n;
                const isFunded = ep.funded;
                const isPast = ep.exDate <= now;
                const statusTag = isFunded ? 'FUNDED / CLAIMABLE' : isPast ? 'EXPIRED' : 'ACTIVE / LIVE';

                return (
                  <tr key={ep.epochId}>
                    <td>Epoch Coupon</td>
                    <td>EC (Epoch {ep.epochId})</td>
                    <td className="prism-table__addr" title={DEPLOYED_ADDRESSES.EpochCoupon}>
                      ID #{ep.epochId}
                    </td>
                    <td><strong>{formatBalanceValue(bal, formatStock)}</strong></td>
                    <td>
                      <span className={`prism-tag ${isFunded ? 'prism-tag--success' : isPast ? 'prism-tag--neutral' : 'prism-tag--accent'}`}>
                        {statusTag}
                      </span>
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
