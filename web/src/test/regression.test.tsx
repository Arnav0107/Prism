import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp } from '../app/context/AppContext';
import { WalletBar } from '../app/components/WalletBar';
import {
  getDevWalletClient,
  getDevAccounts,
  ANVIL_DEV_ACCOUNTS,
  LOCAL_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../chain/contracts';
import { App } from '../App';

describe('Production Crash & Read-Only Regression Tests', () => {
  const originalEthereum = (window as unknown as { ethereum?: unknown }).ethereum;

  beforeEach(() => {
    // Ensure window.ethereum is undefined
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    window.location.hash = '#/app';
  });

  afterEach(() => {
    if (originalEthereum !== undefined) {
      (window as unknown as { ethereum?: unknown }).ethereum = originalEthereum;
    }
    window.location.hash = '#/';
    vi.restoreAllMocks();
  });

  it('renders read-only mode without crashing when isDeployedOnMonad is true and window.ethereum is undefined', async () => {
    // window.ethereum is undefined
    expect((window as unknown as { ethereum?: unknown }).ethereum).toBeUndefined();

    // Rendering the full App at #/app must never throw
    let errorThrown = false;
    try {
      render(<App />);
    } catch (err) {
      errorThrown = true;
      console.error('App crashed during render:', err);
    }

    expect(errorThrown).toBe(false);

    // Read-only CTA and Connect Injected button must render
    expect(
      screen.getByText(/Read-only: connect a wallet to interact/i)
    ).toBeInTheDocument();

    const connectBtns = screen.getAllByRole('button', { name: /CONNECT INJECTED/i });
    expect(connectBtns.length).toBeGreaterThan(0);

    // Network banner must display Monad Testnet (10143)
    expect(screen.getByText(/MONAD TESTNET \(10143\)/i)).toBeInTheDocument();

    // Dev account switcher must NOT be rendered when on Monad without wallet
    expect(screen.queryByLabelText(/ACTOR:/i)).not.toBeInTheDocument();

    // Balance values must show '--' when in read-only mode
    const balanceElements = screen.getAllByText('--');
    expect(balanceElements.length).toBeGreaterThan(0);
  });

  it('allows dev-account switcher to work on local chain 31337 in AppProvider', async () => {
    const DevSwitcherTestComponent: React.FC = () => {
      const { accountAddress, walletClient } = useApp();
      return (
        <div>
          <span data-testid="current-address">{accountAddress ?? 'none'}</span>
          <span data-testid="has-client">{walletClient ? 'yes' : 'no'}</span>
          <WalletBar />
        </div>
      );
    };

    render(
      <AppProvider initialChainId={LOCAL_CHAIN_ID}>
        <DevSwitcherTestComponent />
      </AppProvider>
    );

    // On local chain 31337 with no injected wallet, the switcher is rendered
    expect(screen.getByLabelText(/ACTOR:/i)).toBeInTheDocument();
    expect(screen.getByTestId('current-address')).toHaveTextContent(
      ANVIL_DEV_ACCOUNTS[0].address
    );
    expect(screen.getByTestId('has-client')).toHaveTextContent('yes');

    // Switch to Account 1
    fireEvent.change(screen.getByLabelText(/ACTOR:/i), { target: { value: '1' } });
    expect(screen.getByTestId('current-address')).toHaveTextContent(
      ANVIL_DEV_ACCOUNTS[1].address
    );
  });

  it('preserves dev account switcher on local chain 31337', () => {
    const LocalTestWrapper: React.FC = () => {
      const [idx, setIdx] = React.useState(0);
      const accounts = getDevAccounts(LOCAL_CHAIN_ID);
      const active = accounts[idx];

      return (
        <div>
          <label htmlFor="dev-select">ACTOR:</label>
          <select
            id="dev-select"
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
          >
            {accounts.map((acc, i) => (
              <option key={acc.address} value={i}>
                {acc.name}
              </option>
            ))}
          </select>
          <div data-testid="active-dev-address">{active.address}</div>
        </div>
      );
    };

    render(<LocalTestWrapper />);

    expect(screen.getByLabelText(/ACTOR:/i)).toBeInTheDocument();
    expect(screen.getByTestId('active-dev-address')).toHaveTextContent(
      ANVIL_DEV_ACCOUNTS[0].address
    );

    // Switch to Account 1
    fireEvent.change(screen.getByLabelText(/ACTOR:/i), { target: { value: '1' } });
    expect(screen.getByTestId('active-dev-address')).toHaveTextContent(
      ANVIL_DEV_ACCOUNTS[1].address
    );
  });

  it('strictly throws getDevWalletClient on Monad Testnet (10143) and permits on 31337', () => {
    const anvilKey0 = ANVIL_DEV_ACCOUNTS[0].privateKey;

    // Must strictly throw on chain 10143
    expect(() =>
      getDevWalletClient(anvilKey0, 'https://testnet-rpc.monad.xyz', MONAD_TESTNET_CHAIN_ID)
    ).toThrowError(
      /Burner or demo actors using Anvil keys are strictly prohibited on chain 10143/
    );

    // getDevAccounts must also throw on chain 10143
    expect(() => getDevAccounts(MONAD_TESTNET_CHAIN_ID)).toThrowError(
      /Burner or demo actors using Anvil keys are strictly prohibited on chain 10143/
    );

    // Must succeed on chain 31337
    const client = getDevWalletClient(anvilKey0, 'http://127.0.0.1:8545', LOCAL_CHAIN_ID);
    expect(client).toBeDefined();
    expect(client.account?.address).toBe(ANVIL_DEV_ACCOUNTS[0].address);

    const devAccs = getDevAccounts(LOCAL_CHAIN_ID);
    expect(devAccs.length).toBe(4);
  });
});
