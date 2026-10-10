import React from 'react';
import { Section, Label } from '../ui';
import './ParticipantsSection.css';

interface Participant {
  role: string;
  objective: string;
  instrument: string;
  mechanic: string;
  profileType: 'principal' | 'coupon' | 'neutral';
}

const PARTICIPANTS: Participant[] = [
  {
    role: "Long-Term Equity Allocator",
    objective: "Perpetual capital appreciation with zero dividend tax drag or cash reinvestment friction.",
    instrument: "Principal Token (PT)",
    mechanic: "Deposits equity shares or purchases PT at a natural discount to unstripped spot stock.",
    profileType: "principal"
  },
  {
    role: "Yield & Fixed-Income Strategist",
    objective: "Quarterly cash distributions in stablecoins without exposing capital to equity price volatility.",
    instrument: "Epoch Coupon (EC)",
    mechanic: "Buys EC in the Dutch Auction at favorable yields; redeems USDC pro-rata at maturity.",
    profileType: "coupon"
  },
  {
    role: "Corporate & DAO Treasurer",
    objective: "Monetize anticipated future dividend yields for upfront working capital without dilution.",
    instrument: "Vault Depositor / Seller",
    mechanic: "Locks treasury equity into PrismVault, keeps PT for asset backing, and sells EC upfront.",
    profileType: "neutral"
  },
  {
    role: "Arbitrageur & Market Maker",
    objective: "Risk-free basis extraction keeping synthetic parity tightly aligned with spot markets.",
    instrument: "Synthetic Package (PT + EC)",
    mechanic: "Mints when Stock < PT + EC; recombines and redeems underlying when PT + EC < Stock.",
    profileType: "neutral"
  }
];

export const ParticipantsSection: React.FC = () => {
  return (
    <Section
      id="participants"
      number="04"
      category="MARKET PARTICIPATION"
      heading="Participant Matrix"
      lead="Distinct market constituents isolate specific components of risk and return."
    >
      <div className="prism-participants__table-container">
        <table className="prism-participants__table" aria-label="Market Participant Matrix">
          <thead>
            <tr>
              <th scope="col" className="font-mono">CONSTITUENT</th>
              <th scope="col" className="font-mono">PORTFOLIO MANDATE</th>
              <th scope="col" className="font-mono">PRIMARY INSTRUMENT</th>
              <th scope="col" className="font-mono">EXECUTION MECHANIC</th>
            </tr>
          </thead>
          <tbody>
            {PARTICIPANTS.map((p, idx) => (
              <tr key={idx} className={`prism-participants__row prism-participants__row--${p.profileType}`}>
                <td className="prism-participants__cell-role">
                  <strong>{p.role}</strong>
                </td>
                <td className="prism-participants__cell-desc">
                  {p.objective}
                </td>
                <td className="prism-participants__cell-inst font-mono">
                  <span className={`prism-participants__inst-tag prism-participants__inst-tag--${p.profileType}`}>
                    {p.instrument}
                  </span>
                </td>
                <td className="prism-participants__cell-mech font-mono">
                  {p.mechanic}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prism-participants__footer font-mono">
        <Label variant="muted">CAPITAL EFFICIENCY</Label>
        <span className="prism-participants__footnote">
          Zero protocol haircut · Full collateralization · Non-custodial settlement
        </span>
      </div>
    </Section>
  );
};
