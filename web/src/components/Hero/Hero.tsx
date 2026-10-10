import React from 'react';
import { Container, Badge, Button } from '../ui';
import './Hero.css';

export const Hero: React.FC = () => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="prism-hero" aria-labelledby="hero-heading">
      <Container>
        <div className="prism-hero__meta-top">
          <Badge variant="accent">Testnet · Mock Stock</Badge>
          <span className="prism-hero__issue font-mono">PROSPECTUS NO. 01 · MONAD METROPOLIS</span>
        </div>

        <div className="prism-hero__grid">
          <div className="prism-hero__content">
            <h1 id="hero-heading" className="prism-hero__title">
              A share is two things.
            </h1>
            <p className="prism-hero__subtitle">
              Splitting tokenized equity into capital appreciation and recurring yield on Monad.
            </p>
            <p className="prism-hero__body">
              When equity is locked in a vault, its rights bifurcate: the <strong>Principal Token</strong> captures perpetual capital growth, while fixed-term <strong>Epoch Coupons</strong> harvest dividend cash flows. Trade what you want; strip what you don&apos;t.
            </p>

            <div className="prism-hero__actions">
              <Button
                variant="primary"
                onClick={() => scrollToSection('mechanics')}
              >
                Read Prospectus
              </Button>
              <Button
                variant="secondary"
                href="https://github.com/Arnav0107/Prism"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Smart Contracts
              </Button>
            </div>
          </div>

          <div className="prism-hero__visual" aria-hidden="true">
            <div className="prism-hero__diagram-frame">
              <div className="prism-hero__diagram-header font-mono">
                <span>FIG. 1 — STRIPPED EQUITY SPECIFICATION</span>
                <span className="prism-hero__diagram-badge">INVARIANTS TESTED</span>
              </div>
              <svg
                className="prism-hero__svg"
                viewBox="0 0 460 220"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Reference Grid lines */}
                <line x1="20" y1="20" x2="440" y2="20" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                <line x1="20" y1="110" x2="440" y2="110" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                <line x1="20" y1="206" x2="440" y2="206" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                <line x1="180" y1="15" x2="180" y2="210" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />

                {/* Incoming Equity Share */}
                <path
                  className="prism-hero__line prism-hero__line--root"
                  d="M 20 110 L 180 110"
                />

                {/* Split Node / Vault */}
                <circle cx="180" cy="110" r="4.5" className="prism-hero__node-center" />

                {/* Branch 1: Principal Token */}
                <path
                  className="prism-hero__line prism-hero__line--principal"
                  d="M 180 110 C 220 110, 240 50, 420 50"
                />
                <circle cx="420" cy="50" r="3.5" className="prism-hero__node-principal" />

                {/* Branch 2: Epoch Coupons */}
                <path
                  className="prism-hero__line prism-hero__line--coupon"
                  d="M 180 110 C 220 110, 240 170, 420 170"
                />
                <circle cx="420" cy="170" r="3.5" className="prism-hero__node-coupon" />

                {/* Labels in SVG */}
                <text x="30" y="98" className="prism-hero__svg-label font-mono">1.0 MOCK SHARE</text>
                <text x="180" y="132" textAnchor="middle" className="prism-hero__svg-sublabel font-mono">PRISM VAULT</text>
                
                <text x="420" y="32" textAnchor="end" className="prism-hero__svg-label prism-hero__svg-label--principal font-mono">
                  1.0 PRINCIPAL (PT-STOCK)
                </text>
                <text x="420" y="44" textAnchor="end" className="prism-hero__svg-sublabel font-mono">
                  ERC-20 · UNDERLYING EQUITY
                </text>

                <text x="420" y="186" textAnchor="end" className="prism-hero__svg-label prism-hero__svg-label--coupon font-mono">
                  1.0 EPOCH COUPON (EC-2026-Q4)
                </text>
                <text x="420" y="198" textAnchor="end" className="prism-hero__svg-sublabel font-mono">
                  ERC-1155 · PRO-RATA CASH FLOW
                </text>
              </svg>

              <div className="prism-hero__diagram-footer font-mono">
                <span>INVARIANT: 1 SHARE ⇌ 1 PT + 1 EC</span>
                <span>NON-DILUTIVE RECOMBINATION</span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
