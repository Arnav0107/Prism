import React from 'react';
import { Section, Button, Badge } from '../ui';
import './DisclosuresSection.css';

interface ItemSpec {
  name: string;
  type: string;
  status: 'LIVE ON MONAD' | 'TESTNET MOCK' | 'PLANNED';
  description: string;
  fileLink: string;
}

const ITEMS: ItemSpec[] = [
  {
    name: "PrismVault.sol",
    type: "Smart Contract",
    status: "LIVE ON MONAD",
    description: "Core custody and bifurcation engine. Enforces strict solvency invariant: 1 Share ⇌ 1 PT + 1 EC. Fixed deposit, claim, and recombination logic.",
    fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrismVault.sol"
  },
  {
    name: "PrismAuction.sol",
    type: "Smart Contract",
    status: "LIVE ON MONAD",
    description: "Descending Dutch Auction engine for ERC-1155 coupons. Per-second price decay against block.timestamp with full buyer protection.",
    fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrismAuction.sol"
  },
  {
    name: "PrincipalToken.sol",
    type: "Smart Contract",
    status: "LIVE ON MONAD",
    description: "ERC-20 token representing perpetual underlying equity stripped of intermediate dividend distributions.",
    fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/PrincipalToken.sol"
  },
  {
    name: "EpochCoupon.sol",
    type: "Smart Contract",
    status: "LIVE ON MONAD",
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
    description: "Currently driven by MockDividendSource.sol for testing. Mainnet design targets Chainlink or Pyth corporate actions feed.",
    fileLink: "https://github.com/Arnav0107/Prism/blob/main/contracts/IDividendSource.sol"
  }
];

export const DisclosuresSection: React.FC = () => {
  return (
    <Section
      id="disclosures"
      number="05"
      category="AUDIT & VERIFICATION"
      heading="What Is Real"
      lead="Transparent architectural inventory distinguishing production-ready smart contracts from testnet fixtures."
    >
      <div className="prism-disclosures__grid">
        {ITEMS.map((item, idx) => (
          <div key={idx} className="prism-disclosures__card">
            <div className="prism-disclosures__card-head">
              <div>
                <span className="prism-disclosures__item-type font-mono">{item.type}</span>
                <h3 className="prism-disclosures__item-name font-mono">{item.name}</h3>
              </div>
              <Badge variant={item.status === 'LIVE ON MONAD' ? 'accent' : 'neutral'}>
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
          <span className="font-mono prism-disclosures__audit-tag">FORMAL VERIFICATION & TESTS</span>
          <h4 className="prism-disclosures__audit-title">30 Automated Foundry Test Suites Passing</h4>
          <p className="prism-disclosures__audit-text">
            Includes solvency invariant fuzz tests, multi-depositor race conditions, epoch lifecycle transitions, and Dutch auction price clearing tests.
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
