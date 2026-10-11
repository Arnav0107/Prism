import { describe, it, expect } from 'vitest';
import {
  calculateBuyCostCeil,
  formatStock,
  formatUsdc,
  formatUsdcPrice,
  parseStock,
  parseUsdc,
  COUPON_PRECISION,
} from '../contracts';
import { formatCustomErrorMessage, decodeContractError } from '../errors';

describe('Chain Adapter Math & Rounding', () => {
  it('calculateBuyCostCeil rounds up on fractional sub-cent dust amounts', () => {
    // 1 wei coupon at $0.50 price (500,000 base units)
    const amount = 1n;
    const price = 500_000n;
    const cost = calculateBuyCostCeil(amount, price);

    // Truncation would give 0n, which allows zero-cost fills. Ceil must give 1n.
    expect(cost).toBe(1n);
  });

  it('calculateBuyCostCeil calculates exact full multiples correctly', () => {
    // 100 coupons at $1.25 USDC (1,250,000 base units)
    const amount = 100n * COUPON_PRECISION;
    const price = 1_250_000n;
    const cost = calculateBuyCostCeil(amount, price);

    // 100 * 1.25 = 125 USDC = 125,000,000 base units
    expect(cost).toBe(125_000_000n);
  });

  it('calculateBuyCostCeil returns 0 on zero inputs', () => {
    expect(calculateBuyCostCeil(0n, 1_000_000n)).toBe(0n);
    expect(calculateBuyCostCeil(10n * COUPON_PRECISION, 0n)).toBe(0n);
  });

  it('guarantees totalCost * COUPON_PRECISION >= amount * price for all samples', () => {
    const testCases: [bigint, bigint][] = [
      [1n, 1n],
      [7n, 999_999n],
      [123_456_789n, 500_000n],
      [COUPON_PRECISION / 3n, 1_333_333n],
      [50n * COUPON_PRECISION, 750_000n],
    ];

    for (const [amount, price] of testCases) {
      const cost = calculateBuyCostCeil(amount, price);
      expect(cost * COUPON_PRECISION).toBeGreaterThanOrEqual(amount * price);
    }
  });

  it('formats stock and USDC quantities cleanly', () => {
    expect(formatStock(1n * COUPON_PRECISION)).toBe('1.00');
    expect(formatUsdc(1_250_000n)).toBe('1.25');
    expect(formatUsdcPrice(500_000n)).toBe('0.5000');
  });

  it('parses valid inputs and safely returns 0n on invalid inputs', () => {
    expect(parseStock('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(parseUsdc('2.25')).toBe(2_250_000n);
    expect(parseStock('abc')).toBe(0n);
    expect(parseUsdc('')).toBe(0n);
  });
});

describe('Custom Revert Error Decoder', () => {
  it('formats custom contract errors into plain English', () => {
    expect(formatCustomErrorMessage('EpochAlreadyFunded', [2])).toBe(
      'This epoch (2) is already funded.'
    );

    expect(formatCustomErrorMessage('EpochNotFunded', [1])).toBe(
      'This epoch (1) is not yet funded with dividend USDC.'
    );

    expect(formatCustomErrorMessage('FutureEpochsRemain')).toBe(
      'Cannot redeem Principal Token while active future quarterly epochs remain.'
    );

    expect(formatCustomErrorMessage('SlippageExceeded', [1_500_000n, 1_200_000n])).toContain(
      'Current price: $1.5000, Max: $1.2000'
    );

    expect(formatCustomErrorMessage('InsufficientAuctionLiquidity')).toContain(
      'Requested quantity exceeds the remaining tokens'
    );
  });

  it('detects user cancellations and wallet rejection messages', () => {
    const cancelError = new Error('User rejected the request.');
    expect(decodeContractError(cancelError)).toBe('Transaction was cancelled by user in wallet.');
  });

  it('extracts error names from error messages', () => {
    const revertErr = new Error('execution reverted: custom error EpochAlreadyFunded');
    expect(decodeContractError(revertErr)).toContain('already funded');
  });
});
