import { describe, it, expect, vi } from 'vitest';
import {
  computeDepositState,
  computeRecombineState,
  formatBalanceStateValue,
  formatStock,
} from '../chain/contracts';
import {
  validateContractAddresses,
  checkNetworkHealth,
  isRealAddress,
  type ContractAddresses,
} from '../config/deployments';
import type { PublicClient, Address } from 'viem';

describe('Balance State Machine UI Logic', () => {
  it('formats balance values correctly across states', () => {
    const val = 1_000_000n * 10n ** 18n;

    expect(formatBalanceStateValue('loading', val, formatStock)).toBe('...');
    expect(formatBalanceStateValue('loaded', val, formatStock)).toBe('1,000,000.00');
    expect(formatBalanceStateValue('error', val, formatStock)).toBe('--');
    expect(formatBalanceStateValue('not-deployed', val, formatStock)).toBe('--');
    expect(formatBalanceStateValue('loaded', undefined, formatStock)).toBe('--');
  });

  describe('Rule: "Insufficient balance" appears ONLY in the loaded state', () => {
    const requested = 10n * 10n ** 18n; // 10 mSTOCK
    const lowBalance = 5n * 10n ** 18n;  // 5 mSTOCK (< requested)
    const highBalance = 100n * 10n ** 18n; // 100 mSTOCK (> requested)

    it('when loading: does NOT show insufficient balance even if balance is 0 or less than requested', () => {
      const state = computeDepositState({
        balanceStatus: 'loading',
        stockBalance: 0n,
        parsedDeposit: requested,
        needsApproval: false,
        isSubmitting: false,
      });

      expect(state.hasInsufficientStock).toBe(false);
      expect(state.disabled).toBe(true);
      expect(state.buttonText).toBe('LOADING BALANCES...');
    });

    it('when not-deployed: does NOT show insufficient balance', () => {
      const state = computeDepositState({
        balanceStatus: 'not-deployed',
        stockBalance: 0n,
        parsedDeposit: requested,
        needsApproval: false,
        isSubmitting: false,
      });

      expect(state.hasInsufficientStock).toBe(false);
      expect(state.disabled).toBe(true);
      expect(state.buttonText).toBe('CONTRACTS NOT DEPLOYED');
    });

    it('when error: does NOT show insufficient balance', () => {
      const state = computeDepositState({
        balanceStatus: 'error',
        stockBalance: 0n,
        parsedDeposit: requested,
        needsApproval: false,
        isSubmitting: false,
      });

      expect(state.hasInsufficientStock).toBe(false);
      expect(state.disabled).toBe(true);
      expect(state.buttonText).toBe('ERROR LOADING BALANCES');
    });

    it('when loaded and balance < requested: DOES show insufficient balance', () => {
      const state = computeDepositState({
        balanceStatus: 'loaded',
        stockBalance: lowBalance,
        parsedDeposit: requested,
        needsApproval: false,
        isSubmitting: false,
      });

      expect(state.hasInsufficientStock).toBe(true);
      expect(state.disabled).toBe(true);
      expect(state.buttonText).toBe('INSUFFICIENT mSTOCK BALANCE');
    });

    it('when loaded and balance >= requested: enables button for approval or deposit', () => {
      // Needs approval
      const stateApproval = computeDepositState({
        balanceStatus: 'loaded',
        stockBalance: highBalance,
        parsedDeposit: requested,
        needsApproval: true,
        isSubmitting: false,
      });

      expect(stateApproval.hasInsufficientStock).toBe(false);
      expect(stateApproval.disabled).toBe(false);
      expect(stateApproval.buttonText).toBe('APPROVE mSTOCK');

      // Ready to deposit
      const stateDeposit = computeDepositState({
        balanceStatus: 'loaded',
        stockBalance: highBalance,
        parsedDeposit: requested,
        needsApproval: false,
        isSubmitting: false,
      });

      expect(stateDeposit.hasInsufficientStock).toBe(false);
      expect(stateDeposit.disabled).toBe(false);
      expect(stateDeposit.buttonText).toBe('DEPOSIT & BIFURCATE');
    });
  });

  describe('Recombine button state machine', () => {
    it('shows loading, not-deployed, or error states instead of ineligible when not loaded', () => {
      expect(
        computeRecombineState({
          balanceStatus: 'loading',
          canRecombine: false,
          isSubmitting: false,
        }).buttonText
      ).toBe('LOADING BALANCES...');

      expect(
        computeRecombineState({
          balanceStatus: 'not-deployed',
          canRecombine: false,
          isSubmitting: false,
        }).buttonText
      ).toBe('CONTRACTS NOT DEPLOYED');

      expect(
        computeRecombineState({
          balanceStatus: 'error',
          canRecombine: false,
          isSubmitting: false,
        }).buttonText
      ).toBe('ERROR LOADING BALANCES');
    });

    it('shows ineligible only when loaded and conditions not met', () => {
      const state = computeRecombineState({
        balanceStatus: 'loaded',
        canRecombine: false,
        isSubmitting: false,
      });
      expect(state.disabled).toBe(true);
      expect(state.buttonText).toBe('INELIGIBLE TO RECOMBINE');
    });

    it('shows recombine action when loaded and eligible', () => {
      const state = computeRecombineState({
        balanceStatus: 'loaded',
        canRecombine: true,
        isSubmitting: false,
      });
      expect(state.disabled).toBe(false);
      expect(state.buttonText).toBe('RECOMBINE & UNLOCK SHARE');
    });
  });
});

describe('Address Resolution & Network Health', () => {
  const completeConfig: { chainId: number; contracts: ContractAddresses } = {
    chainId: 31337,
    contracts: {
      MockStock: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      MockUSDC: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      MockDividendSource: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      PrismVault: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      PrincipalToken: '0xd8058efe0198ae9dD7D563e1b4938Dcbc86A1F81',
      EpochCoupon: '0x6D544390Eb535d61e196c87d6B9c80dCD8628Acd',
      PrismAuction: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    },
  };

  it('isRealAddress validates address checksum and non-zero format', () => {
    expect(isRealAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3')).toBe(true);
    expect(isRealAddress('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isRealAddress('invalid-address')).toBe(false);
    expect(isRealAddress(undefined)).toBe(false);
  });

  it('validateContractAddresses passes for valid configuration', () => {
    const res = validateContractAddresses(completeConfig.contracts);
    expect(res.valid).toBe(true);
    expect(res.missing).toHaveLength(0);
  });

  it('validateContractAddresses fails loudly for missing or zero addresses', () => {
    const incompleteContracts = {
      MockStock: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address,
      MockUSDC: '0x0000000000000000000000000000000000000000' as Address,
      PrismVault: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    };

    const res = validateContractAddresses(incompleteContracts as any);
    expect(res.valid).toBe(false);
    expect(res.missing).toContain('MockUSDC');
    expect(res.missing).toContain('PrincipalToken');
    expect(res.missing).toContain('EpochCoupon');
  });

  it('checkNetworkHealth detects unreachable RPC', async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as unknown as PublicClient;

    const health = await checkNetworkHealth(mockClient, completeConfig.contracts, 31337);
    expect(health.isReady).toBe(false);
    expect(health.status).toBe('rpc_unreachable');
    expect(health.message).toContain('RPC unreachable');
  });

  it('checkNetworkHealth detects empty bytecode on restarted Anvil node', async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getBytecode: vi.fn().mockResolvedValue('0x'), // No bytecode deployed
    } as unknown as PublicClient;

    const health = await checkNetworkHealth(mockClient, completeConfig.contracts, 31337);
    expect(health.isReady).toBe(false);
    expect(health.status).toBe('not_deployed');
    expect(health.message).toContain('Contracts not found on this chain — run scripts/deploy-local');
  });

  it('checkNetworkHealth confirms ready when bytecode is present', async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getBytecode: vi.fn().mockResolvedValue('0x6080604052...'), // Valid bytecode
    } as unknown as PublicClient;

    const health = await checkNetworkHealth(mockClient, completeConfig.contracts, 31337);
    expect(health.isReady).toBe(true);
    expect(health.status).toBe('loaded');
    expect(health.message).toContain('Connected');
  });
});
