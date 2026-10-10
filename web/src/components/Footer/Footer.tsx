import React from 'react';
import { Container, Rule } from '../ui';
import './Footer.css';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="prism-footer">
      <Container>
        <Rule spacing="none" />

        <div className="prism-footer__top">
          <div className="prism-footer__brand">
            <div className="prism-footer__logo">
              <span className="font-mono prism-footer__logo-name">PRISM</span>
              <span className="prism-footer__logo-mark" aria-hidden="true">
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                  <path d="M 0 6 L 8 6" stroke="var(--color-text-primary)" strokeWidth="1.5" />
                  <path d="M 8 6 C 12 6, 14 2, 24 2" stroke="var(--color-text-primary)" strokeWidth="1.5" />
                  <path d="M 8 6 C 12 6, 14 10, 24 10" stroke="var(--color-vermilion)" strokeWidth="1.5" />
                </svg>
              </span>
            </div>
            <p className="prism-footer__tagline">
              Bifurcating tokenized equity into capital appreciation and recurring yield on Monad.
            </p>
          </div>

          <nav className="prism-footer__nav" aria-label="Prospectus Index">
            <div className="prism-footer__nav-group">
              <span className="font-mono prism-footer__nav-title">SECTIONS</span>
              <ul className="prism-footer__nav-list">
                <li><a href="#mechanics">01 / Mechanics</a></li>
                <li><a href="#how-it-works">02 / Lifecycle</a></li>
                <li><a href="#auction">03 / Dutch Auction</a></li>
                <li><a href="#participants">04 / Market Matrix</a></li>
                <li><a href="#disclosures">05 / What Is Real</a></li>
              </ul>
            </div>

            <div className="prism-footer__nav-group">
              <span className="font-mono prism-footer__nav-title">REPOSITORY</span>
              <ul className="prism-footer__nav-list">
                <li>
                  <a
                    href="https://github.com/Arnav0107/Prism"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub Source ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Arnav0107/Prism/actions"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Foundry CI Status ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Arnav0107/Prism/tree/main/contracts"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Smart Contracts ↗
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <Rule variant="subtle" spacing="sm" />

        <div className="prism-footer__bottom font-mono">
          <div className="prism-footer__meta">
            <span>SPEC: PRISM-METROPOLIS-PROSPECTUS-01</span>
            <span>·</span>
            <span>MONAD TESTNET · TRACK 1: ONCHAIN FINANCE</span>
            <span>·</span>
            <span>MIT LICENSE</span>
          </div>

          <button
            type="button"
            className="prism-footer__back-top"
            onClick={scrollToTop}
          >
            BACK TO TOP ↑
          </button>
        </div>
      </Container>
    </footer>
  );
};
