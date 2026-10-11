import React from 'react';
import { useApp } from '../context/AppContext';
import { ANVIL_DEV_ACCOUNTS, formatStock, formatUsdc } from '../../chain/contracts';
import './WalletBar.css';

export const WalletBar: React.FC = () => {
  const {
    chainId,
    activeAccountIndex,
    setActiveDevAccount,
    accountAddress,
    connectInjected,
    useInjectedWallet,
    userBalances,
  } = useApp();

  return (
    <div className="prism-wallet-bar font-mono" role="region" aria-label="Wallet and Account Controller">
      <div className="prism-wallet-bar__left">
        <div className="prism-wallet-bar__chain-tag">
          <span className="prism-wallet-bar__status-dot" aria-hidden="true"></span>
          <span>ANVIL {chainId}</span>
        </div>

        {/* Dev Account Switcher (Strictly visible only on ChainId 31337) */}
        {chainId === 31337 && (
          <div className="prism-wallet-bar__switcher">
            <label htmlFor="dev-account-select" className="prism-wallet-bar__label">
              ACTOR:
            </label>
            <select
              id="dev-account-select"
              className="prism-wallet-bar__select font-mono"
              value={useInjectedWallet ? 'injected' : activeAccountIndex}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'injected') {
                  setActiveDevAccount(Number(val));
                }
              }}
            >
              {ANVIL_DEV_ACCOUNTS.map((acc, idx) => (
                <option key={acc.address} value={idx}>
                  {acc.name} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
                </option>
              ))}
              {useInjectedWallet && (
                <option value="injected">
                  Browser Wallet ({accountAddress.slice(0, 6)}...{accountAddress.slice(-4)})
                </option>
              )}
            </select>
          </div>
        )}

        {/* Connect Injected Wallet Button */}
        {!useInjectedWallet && (
          <button
            type="button"
            className="prism-wallet-bar__connect-btn font-mono"
            onClick={connectInjected}
            title="Connect MetaMask or browser Web3 wallet"
          >
            CONNECT INJECTED
          </button>
        )}
      </div>

      {/* Balances Pill */}
      <div className="prism-wallet-bar__right">
        <div className="prism-wallet-bar__balances">
          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">mSTOCK:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {userBalances ? formatStock(userBalances.stockBalance) : '...'}
            </span>
          </span>

          <span className="prism-wallet-bar__bal-divider">|</span>

          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">mUSDC:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {userBalances ? formatUsdc(userBalances.usdcBalance) : '...'}
            </span>
          </span>

          <span className="prism-wallet-bar__bal-divider">|</span>

          <span className="prism-wallet-bar__bal-item">
            <span className="prism-wallet-bar__bal-label">PT:</span>
            <span className="prism-wallet-bar__bal-value font-mono">
              {userBalances ? formatStock(userBalances.ptBalance) : '...'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
