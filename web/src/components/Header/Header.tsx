import React from "react";
import { Container, Badge } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import "./Header.css";

export const Header: React.FC = () => {
  return (
    <header className="prism-header" role="banner">
      <Container className="prism-header__inner">
        {/* Brand / Logo */}
        <a href="#" className="prism-header__brand" aria-label="Prism home">
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
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>

          <div className="prism-header__titles">
            <span className="prism-header__wordmark">PRISM</span>
            <span className="prism-header__descriptor">Monad Metropolis Track 1</span>
          </div>
        </a>

        {/* Status indicator */}
        <div className="prism-header__status">
          <Badge variant="accent">TESTNET · MOCK STOCK</Badge>
        </div>

        {/* Navigation & Theme Switcher */}
        <div className="prism-header__controls">
          <nav className="prism-header__nav" aria-label="Main navigation">
            <a href="#principle" className="prism-header__link">
              Principle
            </a>
            <a href="#mechanism" className="prism-header__link">
              Mechanism
            </a>
            <a href="#market" className="prism-header__link">
              Auction
            </a>
            <a href="#reality" className="prism-header__link">
              What Is Real
            </a>
          </nav>

          <ThemeSwitcher />
        </div>
      </Container>
    </header>
  );
};
