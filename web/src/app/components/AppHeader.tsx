import React from 'react';
import { useApp, type AppTab } from '../context/AppContext';
import { ThemeSwitcher } from '../../components/ThemeSwitcher/ThemeSwitcher';
import './AppHeader.css';

export const AppHeader: React.FC = () => {
  const { activeTab, setActiveTab, setDemoDrawerOpen, chainId } = useApp();

  const tabs: { id: AppTab; label: string; num: string }[] = [
    { id: 'split', label: 'SPLIT & REDEEM', num: '01' },
    { id: 'market', label: 'DUTCH MARKET', num: '02' },
    { id: 'curve', label: 'DIVIDEND CURVE', num: '03' },
    { id: 'portfolio', label: 'PORTFOLIO & CLAIM', num: '04' },
  ];

  return (
    <header className="prism-app-header" role="banner">
      <div className="prism-app-header__inner">
        {/* Brand */}
        <div className="prism-app-header__brand-group">
          <a href="#/" className="prism-app-header__brand" title="Back to Prospectus">
            <svg
              className="prism-app-header__logo-mark"
              width="24"
              height="24"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <line x1="2" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 14 C 14 14, 16 6, 26 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M10 14 C 14 14, 16 22, 26 22" stroke="var(--color-vermilion)" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="prism-app-header__wordmark">PRISM</span>
            <span className="prism-app-header__badge font-mono">APP</span>
          </a>

          <a href="#/" className="prism-app-header__back-link font-mono">
            &larr; PROSPECTUS
          </a>
        </div>

        {/* Tab Navigation */}
        <nav className="prism-app-header__nav" aria-label="Application tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-tab={t.id}
              type="button"
              className={`prism-app-header__tab font-mono ${activeTab === t.id ? 'prism-app-header__tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="prism-app-header__tab-num">{t.num}</span>
              <span className="prism-app-header__tab-label">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="prism-app-header__actions">
          {chainId === 31337 && (
            <button
              type="button"
              className="prism-app-header__demo-btn font-mono"
              onClick={() => setDemoDrawerOpen(true)}
              title="Open Anvil test controls"
            >
              DEMO CONTROLS
            </button>
          )}

          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
};
