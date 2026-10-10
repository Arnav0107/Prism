import React from 'react';
import { Section } from '../ui';
import './HowItWorksSection.css';

interface Step {
  num: string;
  title: string;
  code: string;
  summary: string;
  details: string;
  stateChange: string;
}

const STEPS: Step[] = [
  {
    num: "01",
    title: "Deposit & Bifurcate",
    code: "vault.deposit(amount)",
    summary: "Lock equity shares into the immutable vault contract.",
    details: "The vault escrows underlying MockStock shares. It concurrently mints PrincipalToken (ERC-20) 1:1 and EpochCoupon (ERC-1155) for the active quarterly cycle.",
    stateChange: "+1.0 PT  |  +1.0 EC(epoch)"
  },
  {
    num: "02",
    title: "Fund Dividend Pool",
    code: "vault.fundEpoch(epochId, amount)",
    summary: "Oracle or source deposits quarterly dividend in USDC.",
    details: "Prior to the ex-dividend timestamp, the dividend source transfers USDC. The vault snapshots `fundedSupply` to guarantee mathematical solvency and freeze pro-rata entitlement ratios.",
    stateChange: "USDC escrowed  |  fundedSupply snapshotted"
  },
  {
    num: "03",
    title: "Harvest or Auction",
    code: "auction.buy(id, qty)  |  vault.claim(epochId)",
    summary: "Extract cash flow post-ex-date or sell upfront via Dutch Auction.",
    details: "Coupon holders can hold until ex-date to claim USDC directly from the vault, or list their coupons in the continuous descending-price Dutch Auction to realize immediate liquidity without slippage.",
    stateChange: "-1.0 EC  |  +pro-rata USDC claimed"
  },
  {
    num: "04",
    title: "Recombine & Redeem",
    code: "vault.redeem(amount)",
    summary: "Burn synthetic tokens to recover original equity shares.",
    details: "Whenever a holder has 1.0 Principal Token alongside 1.0 Epoch Coupon of the current live epoch, they may recombine them to immediately withdraw 1.0 underlying MockStock share with zero dilution.",
    stateChange: "-1.0 PT  |  -1.0 EC  |  +1.0 Share"
  }
];

export const HowItWorksSection: React.FC = () => {
  return (
    <Section
      id="how-it-works"
      number="02"
      category="LIFECYCLE PROTOCOL"
      heading="Settlement Mechanics"
      lead="A four-stage lifecycle executed fully on-chain with deterministic solvency guarantees."
    >
      <div className="prism-steps__grid">
        {STEPS.map((step) => (
          <div key={step.num} className="prism-step-card">
            <div className="prism-step-card__header">
              <span className="prism-step-card__num font-mono">{step.num}</span>
              <span className="prism-step-card__code font-mono">{step.code}</span>
            </div>
            <h3 className="prism-step-card__title">{step.title}</h3>
            <p className="prism-step-card__summary">{step.summary}</p>
            <p className="prism-step-card__details">{step.details}</p>
            <div className="prism-step-card__state font-mono">
              <span className="prism-step-card__state-label">DELTA:</span>
              <span className="prism-step-card__state-val">{step.stateChange}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};
