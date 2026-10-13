import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { AppHeader } from './components/AppHeader';
import { WalletBar } from './components/WalletBar';
import { SplitScreen } from './components/SplitScreen';
import { StripCalculator } from './components/StripCalculator';
import { MarketScreen } from './components/MarketScreen';
import { DividendCurveScreen } from './components/DividendCurveScreen';
import { PortfolioScreen } from './components/PortfolioScreen';
import { RiskPanel } from './components/RiskPanel';
import { ActivityFeed } from './components/ActivityFeed';
import { DemoDrawer } from './components/DemoDrawer';
import { TxToast } from './components/TxToast';
import './PrismApp.css';

const AppContent: React.FC = () => {
  const { activeTab, isLoading } = useApp();
  const { theme, setTheme } = useTheme();

  // App defaults to 'ink' (dark) theme per specification
  useEffect(() => {
    if (theme !== 'ink') {
      setTheme('ink');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="prism-app-root">
      <AppHeader />
      <WalletBar />

      <main className="prism-app-main" id="app-main-content">
        <div className="prism-app-container">
          {isLoading ? (
            <div className="prism-app-loading font-mono">
              <span className="prism-app-loading__dot"></span>
              CONNECTING TO ANVIL LOCAL NODE (CHAINID 31337)...
            </div>
          ) : (
            <>
              {activeTab === 'split' && <SplitScreen />}
              {activeTab === 'calc' && <StripCalculator />}
              {activeTab === 'market' && <MarketScreen />}
              {activeTab === 'curve' && <DividendCurveScreen />}
              {activeTab === 'portfolio' && <PortfolioScreen />}
            </>
          )}

          <ActivityFeed />
          <RiskPanel />
        </div>
      </main>

      <DemoDrawer />
      <TxToast />
    </div>
  );
};

export const PrismApp: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};
