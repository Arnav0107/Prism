import { describe, it, expect, vi } from 'vitest';
import {
  getDevAccounts,
  getDevWalletClient,
  callWriteContract,
  formatTimestampToDate,
  validateNonNegativeAmount,
  validateWithinBalance,
  depositShares,
  createAuction,
  buyAuction,
  claimDividend,
  LOCAL_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../contracts';
import { formatCustomErrorMessage, decodeContractError } from '../errors';
import type { WalletClient } from 'viem';

describe('Phase 4 Hardening: Burner Key Restrictions', () => {
  const anvilKey0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  it('permits dev accounts on local Anvil chain (31337)', () => {
    const accounts = getDevAccounts(LOCAL_CHAIN_ID);
    expect(accounts.length).toBe(4);
    expect(accounts[0].address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('strictly throws when dev accounts are requested on Monad Testnet (10143)', () => {
    expect(() => getDevAccounts(MONAD_TESTNET_CHAIN_ID)).toThrowError(
      /Burner or demo actors using Anvil keys are strictly prohibited on chain 10143/
    );
  });

  it('strictly throws when dev accounts are requested on Ethereum Mainnet (1)', () => {
    expect(() => getDevAccounts(1)).toThrowError(
      /Burner or demo actors using Anvil keys are strictly prohibited on chain 1/
    );
  });

  it('permits getDevWalletClient on local chain (31337)', () => {
    const client = getDevWalletClient(anvilKey0, 'http://127.0.0.1:8545', LOCAL_CHAIN_ID);
    expect(client).toBeDefined();
    expect(client.account?.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('strictly throws getDevWalletClient on Monad Testnet (10143)', () => {
    expect(() =>
      getDevWalletClient(anvilKey0, 'https://testnet-rpc.monad.xyz', MONAD_TESTNET_CHAIN_ID)
    ).toThrowError(/Burner or demo actors using Anvil keys are strictly prohibited/);
  });
});

describe('Phase 4 Hardening: Chain-ID Gating & Transaction Simulation', () => {
  it('blocks callWriteContract when wallet chain does not match target chain', async () => {
    const fakeWalletClient = {
      chain: { id: 1 }, // Connected to Mainnet instead of 31337
      account: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
      writeContract: vi.fn(),
    } as unknown as WalletClient;

    await expect(
      callWriteContract(fakeWalletClient, '0x1111111111111111111111111111111111111111', [], 'deposit', [100n])
    ).rejects.toThrowError(/Chain mismatch: wallet is connected to chain 1, but target chain is 31337/);
  });
});

describe('Phase 4 Hardening: Date and Timestamp Formatting', () => {
  it('formats unix timestamp in seconds correctly without Invalid Date', () => {
    // 1735689600 is 2025-01-01 00:00:00 UTC
    const formatted = formatTimestampToDate(1735689600n);
    expect(formatted).not.toBe('Invalid Date');
    expect(formatted).not.toBe('N/A');
    expect(typeof formatted).toBe('string');
  });

  it('handles millisecond timestamp correctly if passed', () => {
    const formatted = formatTimestampToDate(1735689600000);
    expect(formatted).not.toBe('Invalid Date');
    expect(formatted).not.toBe('N/A');
  });

  it('returns N/A for null, undefined, 0, or negative timestamps', () => {
    expect(formatTimestampToDate(undefined)).toBe('N/A');
    expect(formatTimestampToDate(0)).toBe('N/A');
    expect(formatTimestampToDate(0n)).toBe('N/A');
    expect(formatTimestampToDate(-100)).toBe('N/A');
  });
});

describe('Phase 4 Hardening: User Input Validation', () => {
  it('validateNonNegativeAmount rejects zero or negative amounts', () => {
    expect(() => validateNonNegativeAmount(0n, 'Amount')).toThrowError(/must be greater than zero/);
    expect(() => validateNonNegativeAmount(-5n, 'Deposit')).toThrowError(/must be greater than zero/);
    expect(() => validateNonNegativeAmount(100n, 'Deposit')).not.toThrow();
  });

  it('validateWithinBalance rejects amounts exceeding balance', () => {
    expect(() => validateWithinBalance(100n, 50n, 'mSTOCK')).toThrowError(
      /exceeds your available mSTOCK balance/
    );
    expect(() => validateWithinBalance(50n, 100n, 'mSTOCK')).not.toThrow();
  });

  it('write helpers reject invalid parameters before network submission', async () => {
    const dummyWallet = {
      chain: { id: LOCAL_CHAIN_ID },
      account: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    } as unknown as WalletClient;

    await expect(depositShares(dummyWallet, 0n)).rejects.toThrowError(/Deposit amount must be greater than zero/);
    await expect(claimDividend(dummyWallet, 0, 10n)).rejects.toThrowError(/Epoch ID must be greater than zero/);
    await expect(
      createAuction(dummyWallet, 1, 100n, 10n, 50n, 3600n) // startPrice < floorPrice
    ).rejects.toThrowError(/Start price cannot be lower than floor price/);
    await expect(buyAuction(dummyWallet, 1, 0n, 100n)).rejects.toThrowError(/Buy amount must be greater than zero/);
  });
});

describe('Phase 4 Hardening: Custom Revert Error Mappings', () => {
  it('maps new custom contract errors to plain English messages', () => {
    expect(formatCustomErrorMessage('DividendNotLocked', [1])).toMatch(/not locked/);
    expect(formatCustomErrorMessage('SelfTrade')).toMatch(/Self-trading is not permitted/);
    expect(formatCustomErrorMessage('CollateralShortfall')).toMatch(/collateral shortfall detected/);
    expect(formatCustomErrorMessage('EnforcedPause')).toMatch(/protocol is currently paused/);
    expect(formatCustomErrorMessage('NoEpochs')).toMatch(/vault contains no distribution epochs/);
    expect(formatCustomErrorMessage('FundingDefaulted', [2])).toMatch(/funding has defaulted/);
    expect(formatCustomErrorMessage('AuctionExtendsPastExDate')).toMatch(/extends past the epoch ex-dividend date/);
    expect(formatCustomErrorMessage('InvalidPrice')).toMatch(/Invalid price/);
  });

  it('decodeContractError decodes error strings containing new custom errors', () => {
    const err = new Error('Execution reverted with custom error: DividendNotLocked(1)');
    expect(decodeContractError(err)).toMatch(/not locked/);

    const pauseErr = new Error('Reverted: EnforcedPause()');
    expect(decodeContractError(pauseErr)).toMatch(/paused/);
  });
});
