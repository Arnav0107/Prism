import React from 'react';
import { useApp } from '../context/AppContext';
import { ANVIL_DEV_ACCOUNTS, formatStock, formatUsdc, MONAD_TESTNET_CHAIN_ID } from '../../chain/contracts';
import './WalletBar.css';

export const WalletBar: React.FC = () => {
  const {
    chainId,
    activeAccountIndex,
    setActiveDevAccount,
    accountAddress,
    connectInjected,
    switchChain,
    useInjectedWallet,
    userBalances,
    balanceStatus,
    balanceErrorMessage,
    networkHealth,
  } = useApp();

  const isMonad = chainId === MONAD_TESTNET_CHAIN_ID;
  const isAnvil = chainId === 31337;

  const totalCouponsHeld = userBalances?.couponBalances
    ? Object.values(userBalances.couponBalances).reduce((sum, b) => sum + b, 0n)
    : 0n;

  const renderBalance = (val: bigint | undefined, formatter: (b: bigint) => string) => {
    if (balanceStatus === 'loading') return '...';
    if (balanceStatus === 'loaded' && val !== undefined) return formatter(val);
    return '--';
  };

  return (
    <div className="prism-wallet-bar font-mono" role="region" aria-label="Wallet and Account Controller">
      <div className="prism-wallet-bar__left">
        <div
          className="prism-wallet-bar__chain-tag"
          title={networkHealth.message}
        >
          <span
            className={`prism-wallet-bar__status-dot ${
              networkHealth.isReady
                ? 'prism-wallet-bar__status-dot--ready'
                : 'prism-wallet-bar__status-dot--error'
            }`}
            aria-hidden="true"
          ></span>
          <span>
            {isMonad
              ? 'MONAD TESTNET (10143)'
              : isAnvil
                ? `ANVIL (${chainId})`
                : `CHAIN ID ${chainId}`}
          </span>
        </div>

        {/* Switch Chain Button if on wrong network */}
        {useInjectedWallet && !isMonad && (
          <button
            type="button"
            className="prism-wallet-bar__connect-btn font-mono"
            onClick={() => switchChain(MONAD_TESTNET_CHAIN_ID)}
            title="Switch wallet network to Monad Testnet (10143)"
          >
            SWITCH TO MONAD
          </button>
        )}

        {/* Dev Account Switcher (Strictly visible only on ChainId 31337 when not using injected wallet) */}
        {isAnvil && !useInjectedWallet && (
          <div className="prism-wallet-bar__switcher">
            <label htmlFor="dev-account-select" className="prism-wallet-bar__label">
              ACTOR:
            </label>
            <select
              id="dev-account-select"
              className="prism-wallet-bar__select font-mono"
              value={activeAccountIndex}
              onChange={(e) => setActiveDevAccount(Number(e.target.value))}
            >
              {ANVIL_DEV_ACCOUNTS.map((acc, idx) => (
                <option key={acc.address} value={idx}>
                  {acc.name} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Injected Connected indicator */}
        {useInjectedWallet && (
          <span className="prism-wallet-bar__label" style={{ opacity: 0.8 }}>
            WALLET: {accountAddress.slice(0, 6)}...{accountAddress.slice(-4)}
          </span>
        )}

        {/* Connect Injected Wallet Button */}
        {!useInjectedWallet && (
          <button
            type="button"
            className="prism-wallet-bar__connect-btn font-mono"
            onClick={connectInjected}
            title="Connect MetaMask, Rabby, or browser Web3 wallet"
          >
            CONNECT INJECTED
          </button>
        )}
      </div>

      {/* Balances Pill */}
      <div className="prism-wallet-bar__right">
        <div className="prism-wallet-bar__balances" title={balanceErrorMessage}>
          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">mSTOCK:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {renderBalance(userBalances?.stockBalance, formatStock)}
            </span>
          </span>

          <span className="prism-wallet-bar__bal-divider">|</span>

          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">mUSDC:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {renderBalance(userBalances?.usdcBalance, formatUsdc)}
            </span>
          </span>

          <span className="prism-wallet-bar__bal-divider">|</span>

          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">PPT:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {renderBalance(userBalances?.ptBalance, formatStock)}
            </span>
          </span>

          <span className="prism-wallet-bar__bal-divider">|</span>

          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">EC:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {renderBalance(totalCouponsHeld, formatStock)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
