import React, { useState } from 'react';
import './RiskPanel.css';

export const RiskPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="prism-risk-panel font-mono" aria-label="Protocol Risk and Structural Disclosures">
      <div className="prism-risk-panel__header">
        <div className="prism-risk-panel__title-group">
          <span className="prism-risk-panel__tag">SPECIFICATION NOTICE</span>
          <span className="prism-risk-panel__title">Structural Settlement Rules</span>
        </div>
        <button
          type="button"
          className="prism-risk-panel__toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          {collapsed ? '[EXPAND]' : '[COLLAPSE]'}
        </button>
      </div>

      {!collapsed && (
        <ul className="prism-risk-panel__list">
          <li className="prism-risk-panel__item">
            <strong className="prism-risk-panel__bullet">1. CONDITIONAL PAYOUT:</strong> An Epoch Coupon pays out
            pro-rata USDC <em>strictly</em> if a cash DIVIDEND corporate action is declared before ex-date. Non-dividend
            corporate actions (splits, spin-offs) pay zero USDC.
          </li>
          <li className="prism-risk-panel__item">
            <strong className="prism-risk-panel__bullet">2. DUTCH AUCTION DECAY:</strong> Coupon auction prices fall
            strictly linearly per-second against <code>block.timestamp</code> from start price to reserve floor price.
            Escrowed coupons are refunded to the seller if the auction expires unfilled.
          </li>
          <li className="prism-risk-panel__item">
            <strong className="prism-risk-panel__bullet">3. UNAUDITED TEST FIXTURE:</strong> MockStock and
            MockDividendSource are testnet evaluation fixtures. Contracts are invariant-fuzzed in Foundry but not
            commercially audited.
          </li>
          <li className="prism-risk-panel__item">
            <strong className="prism-risk-panel__bullet">4. ZERO PROTOCOL FEES:</strong> There are no protocol haircuts
            or minting fees in this MVP release. Collateral is fully reserved 1:1 on-chain.
          </li>
        </ul>
      )}
    </aside>
  );
};
