import { describe, it, expect } from 'vitest';
import {
  CALCULATOR_DEFAULTS,
  calculateStripVsHold,
} from '../config/calculatorConstants';

describe('Strip vs Hold Calculator - Pure Economics Logic', () => {
  it('calculates expected values for standard 100 shares at $100 price', () => {
    const result = calculateStripVsHold(100, 100, CALCULATOR_DEFAULTS);

    // 100 shares * $1.50 * 4 epochs = $600 gross coupons
    expect(result.couponGrossFaceValue).toBe(600);

    // 5% discount at Dutch auction => 95% realization = $570 cash today
    expect(result.cashReceivedToday).toBe(570);
    expect(result.discountPaidForLiquidity).toBe(30);

    // Retained exposure = 100 shares * $100 = $10,000
    expect(result.priceExposureRetained).toBe(10000);

    // Strip day 1 total = $10,000 + $570 = $10,570
    expect(result.stripDayOneTotal).toBe(10570);

    // Hold strategy: $0 day 1 cash, $600 future dividends, $10,600 total horizon
    expect(result.holdCashToday).toBe(0);
    expect(result.futureDividendsExpected).toBe(600);
    expect(result.holdTotalHorizon).toBe(10600);

    // Takeaway asserts
    expect(result.takeaway).toContain('$570.00');
    expect(result.takeaway).toContain('$10,000.00');
    expect(result.takeaway).toContain('Principal Tokens (PT)');
  });

  it('handles zero and negative states safely', () => {
    const zeroResult = calculateStripVsHold(0, 100);
    expect(zeroResult.cashReceivedToday).toBe(0);
    expect(zeroResult.priceExposureRetained).toBe(0);
    expect(zeroResult.stripDayOneTotal).toBe(0);
    expect(zeroResult.takeaway).toContain('Enter a valid share quantity');

    const negResult = calculateStripVsHold(-50, 100);
    expect(negResult.cashReceivedToday).toBe(0);
    expect(negResult.takeaway).toContain('Enter a valid share quantity');

    const nanResult = calculateStripVsHold(NaN, 100);
    expect(nanResult.cashReceivedToday).toBe(0);
  });

  it('respects custom assumptions', () => {
    const customAssumptions = {
      ...CALCULATOR_DEFAULTS,
      defaultDividendPerEpochUsd: 2.0, // $2.00 per epoch
      defaultEpochsCount: 2,          // 2 epochs
      defaultCouponAuctionDiscount: 0.10, // 10% discount
    };

    const result = calculateStripVsHold(50, 200, customAssumptions);

    // 50 shares * ($2.00 * 2) = $200 gross
    expect(result.couponGrossFaceValue).toBe(200);
    // 90% realization = $180
    expect(result.cashReceivedToday).toBe(180);
    // Retained exposure = 50 * 200 = $10,000
    expect(result.priceExposureRetained).toBe(10000);
  });
});
