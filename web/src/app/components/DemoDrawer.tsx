import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  mintMockTokens,
  declareDividend,
  fundEpoch,
  anvilIncreaseTime,
  anvilMine,
  parseStock,
  parseUsdc,
  DEFAULT_RPC_URL,
} from '../../chain/contracts';
import { decodeContractError } from '../../chain/errors';
import './DemoDrawer.css';

export const DemoDrawer: React.FC = () => {
  const {
    chainId,
    isDemoDrawerOpen,
    setDemoDrawerOpen,
    walletClient,
    publicClient,
    accountAddress,
    vaultData,
    refreshData,
    addToast,
    updateToast,
  } = useApp();

  const [mintStockAmount, setMintStockAmount] = useState('100');
  const [mintUsdcAmount, setMintUsdcAmount] = useState('5000');
  const [dividendEpochId, setDividendEpochId] = useState(1);
  const [dividendRateInput, setDividendRateInput] = useState('1.50');
  const [fundTargetEpochId, setFundTargetEpochId] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  // Strictly hidden if not local Anvil chainId 31337
  if (chainId !== 31337 || !isDemoDrawerOpen) return null;

  const handleMint = async (type: 'stock' | 'usdc') => {
    setIsProcessing(true);
    const amtStr = type === 'stock' ? mintStockAmount : mintUsdcAmount;
    const parsed = type === 'stock' ? parseStock(amtStr) : parseUsdc(amtStr);

    const toastId = addToast({
      type: 'pending',
      title: `Minting Test ${type.toUpperCase()}`,
      message: `Minting ${amtStr} ${type === 'stock' ? 'mSTOCK' : 'mUSDC'} to ${accountAddress.slice(0, 6)}...`,
    });

    try {
      const hash = await mintMockTokens(walletClient, type, accountAddress, parsed);
      updateToast(toastId, { message: 'Waiting for receipt...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Mint Complete',
        message: `Minted ${amtStr} ${type === 'stock' ? 'mSTOCK' : 'mUSDC'}.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Mint Failed', message: decodeContractError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclareDividend = async () => {
    setIsProcessing(true);
    const parsedRate = parseUsdc(dividendRateInput);

    const toastId = addToast({
      type: 'pending',
      title: 'Declaring Dividend',
      message: `Setting Epoch ${dividendEpochId} dividend rate to $${dividendRateInput} per share...`,
    });

    try {
      const hash = await declareDividend(walletClient, dividendEpochId, parsedRate);
      updateToast(toastId, { message: 'Recording declaration on MockDividendSource...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Dividend Declared',
        message: `Epoch ${dividendEpochId} dividend set to $${dividendRateInput}/share.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Declaration Failed', message: decodeContractError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFundEpoch = async () => {
    setIsProcessing(true);
    const toastId = addToast({
      type: 'pending',
      title: `Funding Epoch ${fundTargetEpochId}`,
      message: 'Escrowing dividend USDC into PrismVault and freezing fundedSupply...',
    });

    try {
      const hash = await fundEpoch(walletClient, fundTargetEpochId);
      updateToast(toastId, { message: 'Snapshotting vault state...', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      updateToast(toastId, {
        type: 'success',
        title: 'Epoch Funded',
        message: `Epoch ${fundTargetEpochId} is now funded and ready for coupon claims.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Funding Failed', message: decodeContractError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTimeWarp = async (seconds: number, label: string) => {
    setIsProcessing(true);
    const toastId = addToast({
      type: 'pending',
      title: 'Warping Anvil Time',
      message: `Advancing block.timestamp by ${label}...`,
    });

    try {
      await anvilIncreaseTime(DEFAULT_RPC_URL, seconds);
      await anvilMine(DEFAULT_RPC_URL, 1);
      updateToast(toastId, {
        type: 'success',
        title: 'Time Advanced',
        message: `Simulated +${label}. Blocks mined.`,
      });
      await refreshData();
    } catch (err) {
      updateToast(toastId, { type: 'error', title: 'Time Warp Failed', message: String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="prism-drawer-overlay font-mono" role="dialog" aria-modal="true" aria-label="Anvil Local Controls">
      <div className="prism-drawer-backdrop" onClick={() => setDemoDrawerOpen(false)} />

      <aside className="prism-drawer">
        <div className="prism-drawer__header">
          <div>
            <span className="prism-tag prism-tag--accent">DEV ONLY (CHAINID 31337)</span>
            <h2 className="prism-drawer__title">Anvil Simulation Controls</h2>
          </div>
          <button
            type="button"
            className="prism-drawer__close-btn"
            onClick={() => setDemoDrawerOpen(false)}
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        <div className="prism-drawer__body">
          {/* Section 1: Mint Mock Tokens */}
          <div className="prism-drawer__section">
            <h3 className="prism-drawer__sec-title">1. Mint Test Tokens</h3>
            <p className="prism-drawer__sec-desc">
              Mint mock underlying equity or settlement stablecoins to the currently selected actor:
            </p>

            <div className="prism-drawer__form-row">
              <input
                type="number"
                min="1"
                className="prism-input font-mono"
                value={mintStockAmount}
                onChange={(e) => setMintStockAmount(e.target.value)}
                disabled={isProcessing}
              />
              <button
                type="button"
                className="prism-btn prism-btn--secondary"
                onClick={() => handleMint('stock')}
                disabled={isProcessing}
              >
                MINT mSTOCK
              </button>
            </div>

            <div className="prism-drawer__form-row">
              <input
                type="number"
                min="1"
                className="prism-input font-mono"
                value={mintUsdcAmount}
                onChange={(e) => setMintUsdcAmount(e.target.value)}
                disabled={isProcessing}
              />
              <button
                type="button"
                className="prism-btn prism-btn--secondary"
                onClick={() => handleMint('usdc')}
                disabled={isProcessing}
              >
                MINT mUSDC
              </button>
            </div>
          </div>

          {/* Section 2: Declare Dividend Corporate Action */}
          <div className="prism-drawer__section">
            <h3 className="prism-drawer__sec-title">2. Declare Dividend (Oracle Fixture)</h3>
            <p className="prism-drawer__sec-desc">
              Simulate the off-chain oracle declaring a cash dividend payout on MockDividendSource:
            </p>

            <div className="prism-form-group">
              <label htmlFor="div-epoch-select">TARGET EPOCH</label>
              <select
                id="div-epoch-select"
                className="prism-input font-mono"
                value={dividendEpochId}
                onChange={(e) => setDividendEpochId(Number(e.target.value))}
                disabled={isProcessing}
              >
                {vaultData?.epochs.map((ep) => (
                  <option key={ep.epochId} value={ep.epochId}>
                    Epoch {ep.epochId} ({ep.funded ? 'ALREADY FUNDED' : 'UNFUNDED'})
                  </option>
                ))}
              </select>
            </div>

            <div className="prism-form-group">
              <label htmlFor="div-rate-input">DIVIDEND PER SHARE (USDC)</label>
              <input
                id="div-rate-input"
                type="number"
                step="0.25"
                min="0.01"
                className="prism-input font-mono"
                value={dividendRateInput}
                onChange={(e) => setDividendRateInput(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <button
              type="button"
              className="prism-btn prism-btn--primary"
              onClick={handleDeclareDividend}
              disabled={isProcessing}
            >
              DECLARE CASH DIVIDEND
            </button>
          </div>

          {/* Section 3: Fund Epoch in Vault */}
          <div className="prism-drawer__section">
            <h3 className="prism-drawer__sec-title">3. Fund Epoch (Vault Deposit)</h3>
            <p className="prism-drawer__sec-desc">
              Execute <code>fundEpoch(epochId)</code>. Transfers required USDC from funder to vault and snapshots{' '}
              <code>fundedSupply</code>:
            </p>

            <div className="prism-form-group">
              <label htmlFor="fund-epoch-select">EPOCH TO FUND</label>
              <select
                id="fund-epoch-select"
                className="prism-input font-mono"
                value={fundTargetEpochId}
                onChange={(e) => setFundTargetEpochId(Number(e.target.value))}
                disabled={isProcessing}
              >
                {vaultData?.epochs.map((ep) => (
                  <option key={ep.epochId} value={ep.epochId}>
                    Epoch {ep.epochId} {ep.funded ? '(ALREADY FUNDED)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="prism-btn prism-btn--primary"
              onClick={handleFundEpoch}
              disabled={isProcessing}
            >
              EXECUTE fundEpoch({fundTargetEpochId})
            </button>
          </div>

          {/* Section 4: Anvil Time Warp */}
          <div className="prism-drawer__section">
            <h3 className="prism-drawer__sec-title">4. Warp Anvil Timestamp</h3>
            <p className="prism-drawer__sec-desc">
              Advance EVM block timestamp to test Dutch auction decays and epoch maturities:
            </p>

            <div className="prism-drawer__time-buttons">
              <button
                type="button"
                className="prism-btn prism-btn--secondary"
                onClick={() => handleTimeWarp(3600, '1 Hour')}
                disabled={isProcessing}
              >
                +1 HOUR
              </button>
              <button
                type="button"
                className="prism-btn prism-btn--secondary"
                onClick={() => handleTimeWarp(86400, '1 Day')}
                disabled={isProcessing}
              >
                +1 DAY
              </button>
              <button
                type="button"
                className="prism-btn prism-btn--secondary"
                onClick={() => handleTimeWarp(90 * 86400, '90 Days (1 Quarter)')}
                disabled={isProcessing}
              >
                +90 DAYS (QUARTER)
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
