import React from 'react';
import { Section, Button, Badge } from '../ui';
import { isDeployedOnMonad } from '../../config/deployments';
import './DisclosuresSection.css';

interface ItemSpec {
  name: string;
  type: string;
  status: 'LIVE ON MONAD' | 'TESTNET — NOT YET DEPLOYED' | 'TESTNET MOCK' | 'PLANNED';
  description: string;
  fileLink: string;
}

export const DisclosuresSection: React.FC = () => {
  const contractStatus = isDeployedOnMonad ? 'LIVE ON MONAD' : 'TESTNET — NOT YET DEPLOYED';

  const items: ItemSpec[] = [
    {
      name: "PrismVault.sol",
      type: "Smart Contract",
      status: contractStatus,
      description: "Core custody and bifurcation engine. Enforces 1:1 underlying stock backing per Principal Token and live epoch coupon conservation (1 Share ⇌ 1 PT + 1 EC for live epochs). Fixed deposit, claim, funding grace window, and recombination logic.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrismVault.sol"
    },
    {
      name: "PrismAuction.sol",
      type: "Smart Contract",
      status: contractStatus,
      description: "Descending Dutch Auction engine for ERC-1155 coupons. Per-second price decay against block.timestamp with max-price slippage limits, minimum fill thresholds (1e-3 coupon), and ceil rounding math.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrismAuction.sol"
    },
    {
      name: "PrincipalToken.sol",
      type: "Smart Contract",
      status: contractStatus,
      description: "ERC-20 token representing perpetual underlying equity stripped of intermediate dividend distributions.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrincipalToken.sol"
    },
    {
      name: "EpochCoupon.sol",
      type: "Smart Contract",
      status: contractStatus,
      description: "ERC-1155 multi-token issuing discrete quarterly dividend claim vouchers, burned upon pro-rata USDC redemption.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/EpochCoupon.sol"
    },
    {
      name: "MockStock.sol / MockUSDC.sol",
      type: "Testnet Fixture",
      status: "TESTNET MOCK",
      description: "Simulated ERC-20 tokens used for local Anvil and Monad testnet evaluation. Not registered securities or fiat currency.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/MockStock.sol"
    },
    {
      name: "Dividend Oracle Feed",
      type: "Oracle Integration",
      status: "PLANNED",
      description: "Currently driven by MockDividendSource.sol for testing with event re-declaration and locking. Mainnet design targets Chainlink or Pyth corporate actions feed.",
      fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/IDividendSource.sol"
    }
  ];

  return (
    <Section
      id="disclosures"
      number="05"
      category="SPECIFICATIONS & TESTING"
      heading="What Is Real"
      lead="Transparent architectural inventory distinguishing implemented and tested smart contracts from testnet fixtures."
    >
      <div className="prism-disclosures__grid">
        {items.map((item, idx) => (
          <div key={idx} className="prism-disclosures__card">
            <div className="prism-disclosures__card-head">
              <div>
                <span className="prism-disclosures__item-type font-mono">{item.type}</span>
                <h3 className="prism-disclosures__item-name font-mono">{item.name}</h3>
              </div>
              <Badge variant={item.status === 'LIVE ON MONAD' ? 'accent' : item.status === 'TESTNET — NOT YET DEPLOYED' ? 'neutral' : 'neutral'}>
                {item.status}
              </Badge>
            </div>
            
            <p className="prism-disclosures__item-desc">
              {item.description}
            </p>

            <div className="prism-disclosures__card-foot">
              <a
                href={item.fileLink}
                target="_blank"
                rel="noopener noreferrer"
                className="prism-disclosures__link font-mono"
              >
                VIEW SOURCE CODE ↗
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="prism-disclosures__audit-banner">
        <div className="prism-disclosures__audit-copy">
          <span className="font-mono prism-disclosures__audit-tag">INVARIANT FUZZING & AUTOMATED TESTS</span>
          <h4 className="prism-disclosures__audit-title">46 Automated Foundry Tests & Stateful Invariant Suites Passing</h4>
          <p className="prism-disclosures__audit-text">
            Enforces 4 stateful protocol invariants across 256 runs & 50 depths (12,800 handler actions): stock-principal 1:1 conservation, coupon supply bounds, USDC dividend claim reserves, and auction escrow reconciliation.
          </p>
        </div>
        <div className="prism-disclosures__audit-action">
          <Button
            variant="secondary"
            href="https://github.com/Arnav0107/Prism"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Repository
          </Button>
        </div>
      </div>
    </Section>
  );
};
