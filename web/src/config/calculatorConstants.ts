/**
 * Strip vs Hold Calculator Default Constants & Economic Model Assumptions
 * 
 * Used when calculating upfront liquidity vs hold-to-maturity dividend returns.
 */

export interface CalculatorAssumptions {
  /** Default stock market price per share in USD */
  defaultStockPriceUsd: number;
  /** Expected net dividend per share per epoch in USD */
  defaultDividendPerEpochUsd: number;
  /** Default number of quarterly epochs in the horizon */
  defaultEpochsCount: number;
  /** Estimated discount rate / haircut when selling coupons upfront via Dutch auction (e.g. 0.05 = 5%) */
  defaultCouponAuctionDiscount: number;
  /** Horizon description */
  horizonLabel: string;
  /** Corporate withholding tax rate assumed (0% default in demo) */
  withholdingTaxBps: number;
}

export const CALCULATOR_DEFAULTS: CalculatorAssumptions = {
  defaultStockPriceUsd: 100.0,
  defaultDividendPerEpochUsd: 1.5,
  defaultEpochsCount: 4,
  defaultCouponAuctionDiscount: 0.05, // 5% time-value-of-money discount at Dutch auction
  horizonLabel: '1 Year (4 Quarterly Epochs)',
  withholdingTaxBps: 0,
};

export interface StripVsHoldResult {
  shares: number;
  sharePrice: number;
  // Strip Strategy
  cashReceivedToday: number;
  couponGrossFaceValue: number;
  priceExposureRetained: number;
  stripDayOneTotal: number;
  // Hold Strategy
  holdCashToday: number;
  futureDividendsExpected: number;
  holdTotalHorizon: number;
  // Delta & Takeaway
  upfrontLiquidityAdvantage: number;
  discountPaidForLiquidity: number;
  takeaway: string;
}

/**
 * Pure calculation function for Strip vs Hold economics.
 */
export function calculateStripVsHold(
  shares: number,
  sharePrice: number,
  assumptions: CalculatorAssumptions = CALCULATOR_DEFAULTS
): StripVsHoldResult {
  if (shares <= 0 || sharePrice <= 0 || isNaN(shares) || isNaN(sharePrice)) {
    return {
      shares: 0,
      sharePrice: 0,
      cashReceivedToday: 0,
      couponGrossFaceValue: 0,
      priceExposureRetained: 0,
      stripDayOneTotal: 0,
      holdCashToday: 0,
      futureDividendsExpected: 0,
      holdTotalHorizon: 0,
      upfrontLiquidityAdvantage: 0,
      discountPaidForLiquidity: 0,
      takeaway: 'Enter a valid share quantity and share price to evaluate strip economics.',
    };
  }

  const grossDividendPerShare = assumptions.defaultDividendPerEpochUsd * assumptions.defaultEpochsCount;
  const couponGrossFaceValue = shares * grossDividendPerShare;
  
  // Realization rate at auction today (face value discounted by time value of money / auction spread)
  const realizationRate = 1 - assumptions.defaultCouponAuctionDiscount;
  const cashReceivedToday = couponGrossFaceValue * realizationRate;
  const discountPaidForLiquidity = couponGrossFaceValue - cashReceivedToday;

  // Retained stock price exposure via Principal Token (PT) 1:1 backing
  const priceExposureRetained = shares * sharePrice;
  const stripDayOneTotal = priceExposureRetained + cashReceivedToday;

  // Hold strategy
  const holdCashToday = 0;
  const futureDividendsExpected = couponGrossFaceValue;
  const holdTotalHorizon = priceExposureRetained + futureDividendsExpected;

  const upfrontLiquidityAdvantage = cashReceivedToday;

  const formattedCash = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cashReceivedToday);
  const formattedExposure = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceExposureRetained);

  const takeaway = `Stripping ${shares.toLocaleString()} shares yields ${formattedCash} in immediate guaranteed cash today while preserving full ${formattedExposure} capital exposure via Principal Tokens (PT).`;

  return {
    shares,
    sharePrice,
    cashReceivedToday,
    couponGrossFaceValue,
    priceExposureRetained,
    stripDayOneTotal,
    holdCashToday,
    futureDividendsExpected,
    holdTotalHorizon,
    upfrontLiquidityAdvantage,
    discountPaidForLiquidity,
    takeaway,
  };
}
