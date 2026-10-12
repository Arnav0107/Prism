import { describe, it, expect } from 'vitest';
import {
  calculateBuyCostCeil,
  calculateDutchPrice,
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
    expect(formatStock(0n)).toBe('0.00');
    expect(formatStock(1234567n * COUPON_PRECISION)).toBe('1,234,567.00');
    expect(formatUsdc(1_250_000n)).toBe('1.25');
    expect(formatUsdc(0n)).toBe('0.00');
    expect(formatUsdcPrice(500_000n)).toBe('0.5000');
    expect(formatUsdcPrice(1_754_321n)).toBe('1.7543');
  });

  it('parses valid inputs and safely returns 0n on invalid inputs', () => {
    expect(parseStock('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(parseUsdc('2.25')).toBe(2_250_000n);
    expect(parseStock('abc')).toBe(0n);
    expect(parseUsdc('')).toBe(0n);
    expect(parseStock('   ')).toBe(0n);
  });
});

describe('Dutch Auction Linear Price Decay Helper', () => {
  const startPrice = 2_000_000n; // $2.00
  const floorPrice = 500_000n;   // $0.50
  const startTime = 1000n;
  const duration = 1000n;        // 1000 seconds

  it('returns startPrice at t = 0 (startTime)', () => {
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, duration, startTime);
    expect(price).toBe(startPrice);
  });

  it('returns startPrice if currentTime is before startTime', () => {
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, duration, startTime - 50n);
    expect(price).toBe(startPrice);
  });

  it('returns exact midpoint at elapsed = duration / 2', () => {
    const midTime = startTime + duration / 2n;
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, duration, midTime);
    // Midpoint: 2.00 - (1.50 * 500) / 1000 = 2.00 - 0.75 = 1.25
    expect(price).toBe(1_250_000n);
  });

  it('returns floorPrice at elapsed = duration', () => {
    const endTime = startTime + duration;
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, duration, endTime);
    expect(price).toBe(floorPrice);
  });

  it('clamps strictly to floorPrice after duration has elapsed', () => {
    const pastTime = startTime + duration + 500n;
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, duration, pastTime);
    expect(price).toBe(floorPrice);
  });

  it('returns floorPrice if duration is 0', () => {
    const price = calculateDutchPrice(startPrice, floorPrice, startTime, 0n, startTime + 10n);
    expect(price).toBe(floorPrice);
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

    expect(formatCustomErrorMessage('EpochsSealed')).toContain(
      'Epoch creation is sealed'
    );

    expect(formatCustomErrorMessage('MaxEpochsExceeded')).toContain(
      'Maximum number of distribution epochs'
    );

    expect(formatCustomErrorMessage('MaxHorizonExceeded')).toContain(
      'exceeds maximum horizon'
    );

    expect(formatCustomErrorMessage('CannotEnableDemoMode')).toContain(
      'Demo mode cannot be re-enabled'
    );

    expect(formatCustomErrorMessage('UnsupportedCollateral')).toContain(
      'Fee-on-transfer or rebasing tokens are unsupported'
    );

    expect(formatCustomErrorMessage('EventNotLocked', [3])).toContain(
      'Corporate action for epoch 3 must be locked before funding'
    );

    expect(formatCustomErrorMessage('EventAlreadyLocked', [3])).toContain(
      'Corporate action for epoch 3 is locked and immutable'
    );

    expect(formatCustomErrorMessage('EpochAwaitingFunding', [1])).toContain(
      'awaiting dividend funding'
    );

    expect(formatCustomErrorMessage('FillBelowMinimum')).toContain(
      'minimum fill threshold'
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
