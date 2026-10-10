import React from 'react';
import { Section, Rule, Label } from '../ui';
import './DecompositionSection.css';

export const DecompositionSection: React.FC = () => {
  return (
    <Section
      id="mechanics"
      number="01"
      category="INSTRUMENT ARCHITECTURE"
      heading="Bifurcation of Equity Rights"
      lead="A mathematical separation of perpetual capital ownership and discrete yield rights."
    >
      <div className="prism-decomp__intro">
        <p className="prism-decomp__lead">
          Traditional equities bundle two fundamentally different risk profiles into a single instrument: terminal capital value and periodic dividend cash flows. <strong>Prism decouples them at the smart contract level.</strong>
        </p>
      </div>

      <div className="prism-decomp__comparison">
        {/* Column 1: Principal */}
        <article className="prism-decomp__card prism-decomp__card--principal">
          <div className="prism-decomp__card-header">
            <span className="font-mono prism-decomp__tag">INSTRUMENT 01</span>
            <h3 className="prism-decomp__card-title">Principal Token (PT)</h3>
            <p className="prism-decomp__card-desc">
              Perpetual equity claim stripped of intermediate dividend cash flows.
            </p>
          </div>
          
          <Rule variant="subtle" />

          <dl className="prism-decomp__spec-list font-mono">
            <div className="prism-decomp__spec-row">
              <dt>STANDARD</dt>
              <dd>ERC-20 Fungible</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>EXPOSURE</dt>
              <dd>Pure Capital Appreciation</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>DURATION</dt>
              <dd>Perpetual (No Expiry)</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>DIVIDEND RISK</dt>
              <dd>Zero / Stripped Out</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>REDEMPTION</dt>
              <dd>1 PT + 1 Current EC ⇌ 1 Share</dd>
            </div>
          </dl>

          <div className="prism-decomp__card-footer">
            <Label variant="muted">TARGET HOLDER</Label>
            <p className="prism-decomp__holder-text">
              Long-term equity allocators seeking compounding equity exposure without tax drag or dividend reinvestment friction.
            </p>
          </div>
        </article>

        {/* Divider Column */}
        <div className="prism-decomp__separator" aria-hidden="true">
          <div className="prism-decomp__separator-line"></div>
          <span className="prism-decomp__separator-glyph font-mono">⇌</span>
          <div className="prism-decomp__separator-line"></div>
        </div>

        {/* Column 2: Coupon */}
        <article className="prism-decomp__card prism-decomp__card--coupon">
          <div className="prism-decomp__card-header">
            <span className="font-mono prism-decomp__tag prism-decomp__tag--vermilion">INSTRUMENT 02</span>
            <h3 className="prism-decomp__card-title prism-decomp__card-title--vermilion">Epoch Coupon (EC)</h3>
            <p className="prism-decomp__card-desc">
              Fixed-term rights harvesting pro-rata USDC distributions for a defined epoch.
            </p>
          </div>
          
          <Rule variant="subtle" />

          <dl className="prism-decomp__spec-list font-mono">
            <div className="prism-decomp__spec-row">
              <dt>STANDARD</dt>
              <dd>ERC-1155 Multi-Token</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>EXPOSURE</dt>
              <dd>Pro-Rata Dividend Yield</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>DURATION</dt>
              <dd>Discrete Quarter (e.g. Q4 2026)</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>SETTLEMENT</dt>
              <dd>Direct in MockUSDC</dd>
            </div>
            <div className="prism-decomp__spec-row">
              <dt>LIQUIDATION</dt>
              <dd>Burned Upon Claiming</dd>
            </div>
          </dl>

          <div className="prism-decomp__card-footer">
            <Label variant="muted">TARGET HOLDER</Label>
            <p className="prism-decomp__holder-text">
              Yield funds, cash managers, and fixed-income strategies seeking guaranteed cash-flow extraction without equity downside.
            </p>
          </div>
        </article>
      </div>

      <div className="prism-decomp__invariant font-mono">
        <span className="prism-decomp__invariant-label">PROTOCOL INVARIANT:</span>
        <span className="prism-decomp__invariant-formula">
          Total Vault Shares ≡ Total PT Supply ≡ Active Epoch Funded Supply
        </span>
      </div>
    </Section>
  );
};
