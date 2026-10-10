import React from "react";
import { Container } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import "./Header.css";

export const Header: React.FC = () => {
  return (
    <header className="prism-header" role="banner">
      {/* Skip to Main Content Link for Keyboard / Screen Readers */}
      <a href="#main-content" className="prism-skip-link">
        Skip to main content
      </a>

      <Container className="prism-header__inner">
        {/* Brand / Logo */}
        <a href="#" className="prism-header__brand" aria-label="Prism prospectus home">
          <svg
            className="prism-header__logo-mark"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            {/* Root hairline */}
            <line x1="2" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5" />
            {/* Upper split: Principal (ink / text color) */}
            <path
              d="M10 14 C 14 14, 16 6, 26 6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            {/* Lower split: Coupon (vermilion) */}
            <path
              d="M10 14 C 14 14, 16 22, 26 22"
              stroke="var(--color-vermilion)"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>

          <div className="prism-header__titles">
            <span className="prism-header__wordmark">PRISM</span>
            <span className="prism-header__descriptor">Monad Metropolis Track 1</span>
          </div>
        </a>

        {/* Navigation & Theme Switcher */}
        <div className="prism-header__controls">
          <nav className="prism-header__nav" aria-label="Prospectus navigation">
            <a href="#mechanics" className="prism-header__link">
              01 Mechanics
            </a>
            <a href="#how-it-works" className="prism-header__link">
              02 Lifecycle
            </a>
            <a href="#auction" className="prism-header__link">
              03 Auction
            </a>
            <a href="#participants" className="prism-header__link">
              04 Matrix
            </a>
            <a href="#disclosures" className="prism-header__link">
              05 Disclosures
            </a>
          </nav>

          <ThemeSwitcher />
        </div>
      </Container>
    </header>
  );
};
