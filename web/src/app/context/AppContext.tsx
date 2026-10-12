import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import {
  getPublicClient,
  getDevWalletClient,
  getInjectedWalletClient,
  ANVIL_DEV_ACCOUNTS,
  LOCAL_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  fetchVaultOverview,
  fetchUserBalances,
  fetchMarketAuctions,
  type EpochData,
  type AuctionView,
} from '../../chain/contracts';
import { isDeployedOnMonad } from '../../config/deployments';

export type AppTab = 'split' | 'market' | 'curve' | 'portfolio';

export interface ToastItem {
  id: string;
  type: 'pending' | 'success' | 'error';
  title: string;
  message?: string;
  hash?: Hash;
}

export interface AppContextType {
  chainId: number;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  // Account & Network
  isDevAccount: boolean;
  activeAccountIndex: number;
  setActiveDevAccount: (index: number) => void;
  accountAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  isConnectingInjected: boolean;
  connectInjected: () => Promise<void>;
  switchChain: (targetChainId: number) => Promise<void>;
  useInjectedWallet: boolean;
  // Data
  vaultData: {
    epochCount: number;
    demoMode: boolean;
    epochs: EpochData[];
  } | null;
  userBalances: {
    stockBalance: bigint;
    usdcBalance: bigint;
    ptBalance: bigint;
    stockAllowanceVault: bigint;
    usdcAllowanceVault: bigint;
    usdcAllowanceAuction: bigint;
    isAuctionApprovedCoupons: boolean;
    couponBalances: Record<number, bigint>;
  } | null;
  auctions: AuctionView[];
  isLoading: boolean;
  lastUpdated: number;
  refreshData: () => Promise<void>;
  // UI States
  isDemoDrawerOpen: boolean;
  setDemoDrawerOpen: (open: boolean) => void;
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  updateToast: (id: string, updates: Partial<ToastItem>) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chainId, setChainId] = useState<number>(() => {
    return isDeployedOnMonad ? MONAD_TESTNET_CHAIN_ID : LOCAL_CHAIN_ID;
  });

  const getInitialTab = (): AppTab => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('market')) return 'market';
      if (hash.includes('curve')) return 'curve';
      if (hash.includes('portfolio')) return 'portfolio';
    }
    return 'split';
  };

  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);
  const [activeAccountIndex, setActiveAccountIndex] = useState<number>(0);
  const [useInjected, setUseInjected] = useState<boolean>(false);
  const [injectedAddress, setInjectedAddress] = useState<Address | null>(null);
  const [isConnectingInjected, setIsConnectingInjected] = useState<boolean>(false);

  const [vaultData, setVaultData] = useState<AppContextType['vaultData']>(null);
  const [userBalances, setUserBalances] = useState<AppContextType['userBalances']>(null);
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  const [isDemoDrawerOpen, setDemoDrawerOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const publicClient = useMemo(() => getPublicClient(chainId), [chainId]);

  const activeDevAccount = ANVIL_DEV_ACCOUNTS[activeAccountIndex] ?? ANVIL_DEV_ACCOUNTS[0];

  const accountAddress: Address = useInjected && injectedAddress ? injectedAddress : activeDevAccount.address;

  const walletClient: WalletClient = useMemo(() => {
    if (useInjected) {
      const inj = getInjectedWalletClient(chainId);
      if (inj) return inj;
    }
    return getDevWalletClient(activeDevAccount.privateKey);
  }, [useInjected, chainId, activeDevAccount]);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<ToastItem>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const connectInjected = useCallback(async () => {
    setIsConnectingInjected(true);
    try {
      if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
        addToast({
          type: 'error',
          title: 'No Web3 Wallet Found',
          message: 'Please install MetaMask, Rabby, or a compatible browser extension.',
        });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethereum = (window as any).ethereum;
      const client = getInjectedWalletClient(chainId);
      if (!client) throw new Error('Could not initialize injected client');

      const accounts = await client.requestAddresses();
      if (accounts && accounts.length > 0) {
        setInjectedAddress(accounts[0]);
        setUseInjected(true);

        // Detect current wallet chain
        try {
          const hexChain = await ethereum.request({ method: 'eth_chainId' });
          if (hexChain) {
            const parsed = parseInt(hexChain, 16);
            setChainId(parsed);
          }
        } catch {
          // Ignore chain check error
        }

        addToast({
          type: 'success',
          title: 'Wallet Connected',
          message: `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Connection Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnectingInjected(false);
    }
  }, [addToast, chainId]);

  const switchChain = useCallback(
    async (targetChainId: number) => {
      if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
        setChainId(targetChainId);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethereum = (window as any).ethereum;
      const hexChainId = `0x${targetChainId.toString(16)}`;

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }],
        });
        setChainId(targetChainId);
      } catch (switchError: any) {
        // Code 4902 means the chain has not been added to the wallet yet
        if (switchError?.code === 4902 && targetChainId === MONAD_TESTNET_CHAIN_ID) {
          try {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: hexChainId,
                  chainName: 'Monad Testnet',
                  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
                  rpcUrls: ['https://testnet-rpc.monad.xyz'],
                  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
                },
              ],
            });
            setChainId(targetChainId);
          } catch (addError) {
            console.error('Failed to add Monad Testnet to wallet:', addError);
          }
        } else {
          setChainId(targetChainId);
        }
      }
    },
    []
  );

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setInjectedAddress(accounts[0] as Address);
        setUseInjected(true);
      } else {
        setUseInjected(false);
        setInjectedAddress(null);
      }
    };

    const handleChainChanged = (hexChain: string) => {
      const parsed = parseInt(hexChain, 16);
      setChainId(parsed);
    };

    ethereum.on?.('accountsChanged', handleAccountsChanged);
    ethereum.on?.('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const vOverview = await fetchVaultOverview(publicClient);
      setVaultData(vOverview);

      const balances = await fetchUserBalances(publicClient, accountAddress, vOverview.epochCount);
      setUserBalances(balances);

      const mAuctions = await fetchMarketAuctions(publicClient);
      setAuctions(mAuctions);

      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Failed to load contract state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, accountAddress]);

  // Initial fetch and automatic refresh on account change
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Periodic poll every 5s for on-chain state updates
  useEffect(() => {
    const timer = setInterval(() => {
      refreshData();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshData]);

  const setActiveDevAccount = (idx: number) => {
    setUseInjected(false);
    setActiveAccountIndex(idx);
  };

  const value = {
    chainId,
    activeTab,
    setActiveTab,
    isDevAccount: !useInjected,
    activeAccountIndex,
    setActiveDevAccount,
    accountAddress,
    walletClient,
    publicClient,
    isConnectingInjected,
    connectInjected,
    switchChain,
    useInjectedWallet: useInjected,
    vaultData,
    userBalances,
    auctions,
    isLoading,
    lastUpdated,
    refreshData,
    isDemoDrawerOpen,
    setDemoDrawerOpen,
    toasts,
    addToast,
    updateToast,
    removeToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
