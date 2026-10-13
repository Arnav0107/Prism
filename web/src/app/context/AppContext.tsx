import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import {
  getPublicClient,
  getDevWalletClient,
  getInjectedWalletClient,
  getActiveAddresses,
  ANVIL_DEV_ACCOUNTS,
  DEFAULT_RPC_URL,
  LOCAL_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  fetchVaultOverview,
  fetchUserBalances,
  fetchMarketAuctions,
  type EpochData,
  type AuctionView,
} from '../../chain/contracts';
import {
  isDeployedOnMonad,
  checkNetworkHealth,
  type NetworkHealth,
  MONAD_EXPLORER_URL,
} from '../../config/deployments';

export type AppTab = 'split' | 'calc' | 'market' | 'curve' | 'portfolio';
export type BalanceLoadStatus = 'loading' | 'loaded' | 'error' | 'not-deployed';

export interface ToastItem {
  id: string;
  type: 'pending' | 'success' | 'error';
  title: string;
  message?: string;
  hash?: Hash;
}

export interface UserBalances {
  stockBalance: bigint;
  usdcBalance: bigint;
  ptBalance: bigint;
  stockAllowanceVault: bigint;
  usdcAllowanceVault: bigint;
  usdcAllowanceAuction: bigint;
  isAuctionApprovedCoupons: boolean;
  couponBalances: Record<number, bigint>;
}

export interface AppContextType {
  chainId: number;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  // Account & Network
  isDevAccount: boolean;
  activeAccountIndex: number;
  setActiveDevAccount: (index: number) => void;
  accountAddress: Address | null;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  isConnectingInjected: boolean;
  connectInjected: () => Promise<void>;
  switchChain: (targetChainId: number) => Promise<void>;
  useInjectedWallet: boolean;
  networkHealth: NetworkHealth;
  // Balance State Machine
  balanceStatus: BalanceLoadStatus;
  isStale: boolean;
  balanceErrorMessage?: string;
  userBalances: UserBalances | null;
  retryLoad: () => Promise<void>;
  // Data
  vaultData: {
    epochCount: number;
    demoMode: boolean;
    latestBlockTimestamp?: bigint;
    epochs: EpochData[];
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

export const AppProvider: React.FC<{ children: React.ReactNode; initialChainId?: number }> = ({
  children,
  initialChainId,
}) => {
  const [chainId, setChainId] = useState<number>(() => {
    return initialChainId ?? (isDeployedOnMonad ? MONAD_TESTNET_CHAIN_ID : LOCAL_CHAIN_ID);
  });

  const getInitialTab = (): AppTab => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('calc')) return 'calc';
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

  const [balanceStatus, setBalanceStatus] = useState<BalanceLoadStatus>('loading');
  const [isStale, setIsStale] = useState<boolean>(false);
  const [balanceErrorMessage, setBalanceErrorMessage] = useState<string | undefined>(undefined);
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>({
    status: 'rpc_unreachable',
    message: 'Checking network status...',
    isReady: false,
  });

  const [vaultData, setVaultData] = useState<AppContextType['vaultData']>(null);
  const [userBalances, setUserBalances] = useState<UserBalances | null>(null);
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  const [isDemoDrawerOpen, setDemoDrawerOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const publicClient = useMemo(() => getPublicClient(chainId), [chainId]);

  const activeDevAccount = ANVIL_DEV_ACCOUNTS[activeAccountIndex] ?? ANVIL_DEV_ACCOUNTS[0];

  const isLocal = chainId === LOCAL_CHAIN_ID;

  const accountAddress: Address | null = useMemo(() => {
    if (useInjected && injectedAddress) {
      return injectedAddress;
    }
    if (isLocal) {
      return activeDevAccount.address;
    }
    return null;
  }, [useInjected, injectedAddress, isLocal, activeDevAccount]);

  const walletClient: WalletClient | null = useMemo(() => {
    if (useInjected && injectedAddress) {
      const inj = getInjectedWalletClient(injectedAddress, chainId);
      if (inj) return inj;
    }
    if (isLocal) {
      return getDevWalletClient(activeDevAccount.privateKey, DEFAULT_RPC_URL, LOCAL_CHAIN_ID);
    }
    return null;
  }, [useInjected, injectedAddress, chainId, isLocal, activeDevAccount]);

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
      const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      if (accounts && accounts.length > 0) {
        setInjectedAddress(accounts[0] as Address);
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
                  blockExplorerUrls: [MONAD_EXPLORER_URL],
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

    // Check if wallet is already connected on mount
    ethereum
      .request?.({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          setInjectedAddress(accounts[0] as Address);
          setUseInjected(true);
          ethereum
            .request?.({ method: 'eth_chainId' })
            .then((hexChain: string) => {
              if (hexChain) {
                setChainId(parseInt(hexChain, 16));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

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

  const isRefreshingRef = useRef<boolean>(false);
  const retryDelayRef = useRef<number>(12000);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);

  const refreshData = useCallback(async () => {
    // In-flight guard: prevent overlapping refreshes
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    // Stale-while-revalidate: show 'loading' only when no data has loaded yet
    if (!hasLoadedOnceRef.current) {
      setBalanceStatus('loading');
      setBalanceErrorMessage(undefined);
    }

    try {
      const addresses = getActiveAddresses(chainId);
      const health = await checkNetworkHealth(publicClient, addresses, chainId);
      setNetworkHealth(health);

      if (!health.isReady) {
        if (!hasLoadedOnceRef.current) {
          const bStatus: BalanceLoadStatus = health.status === 'rpc_unreachable' ? 'error' : 'not-deployed';
          setBalanceStatus(bStatus);
          setBalanceErrorMessage(health.message);
        } else {
          setIsStale(true);
        }
        return;
      }

      const vOverview = await fetchVaultOverview(publicClient);
      setVaultData(vOverview);

      if (accountAddress) {
        const balances = await fetchUserBalances(publicClient, accountAddress, vOverview.epochCount);
        setUserBalances(balances);
      } else {
        setUserBalances(null);
      }

      const mAuctions = await fetchMarketAuctions(publicClient);
      setAuctions(mAuctions);

      hasLoadedOnceRef.current = true;
      setBalanceStatus('loaded');
      setIsStale(false);
      setBalanceErrorMessage(undefined);
      setLastUpdated(Date.now());
      retryDelayRef.current = 12000;
    } catch (err) {
      console.error('Failed to load contract state:', err);
      if (!hasLoadedOnceRef.current) {
        setBalanceStatus('error');
        setBalanceErrorMessage(err instanceof Error ? err.message : 'Failed to query smart contract state.');
      } else {
        setIsStale(true);
      }
      retryDelayRef.current = Math.min(Math.round(retryDelayRef.current * 1.5), 30000);
    } finally {
      isRefreshingRef.current = false;
      setIsLoading(false);
    }
  }, [publicClient, accountAddress, chainId]);

  // Initial fetch and automatic refresh on account change
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Periodic poll every 12s, pause while hidden, retry with exponential backoff on failure
  useEffect(() => {
    let isSubscribed = true;

    const scheduleNext = (delayMs: number) => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(async () => {
        if (!isSubscribed) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        await refreshData();
        if (isSubscribed) {
          scheduleNext(retryDelayRef.current);
        }
      }, delayMs);
    };

    scheduleNext(12000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        retryDelayRef.current = 12000;
        refreshData().finally(() => {
          if (isSubscribed) scheduleNext(12000);
        });
      } else {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isSubscribed = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [refreshData]);

  const setActiveDevAccount = (idx: number) => {
    setUseInjected(false);
    setActiveAccountIndex(idx);
  };

  const value = {
    chainId,
    activeTab,
    setActiveTab,
    isDevAccount: !useInjected && isLocal && Boolean(accountAddress),
    activeAccountIndex,
    setActiveDevAccount,
    accountAddress,
    walletClient,
    publicClient,
    isConnectingInjected,
    connectInjected,
    switchChain,
    useInjectedWallet: useInjected,
    networkHealth,
    balanceStatus,
    isStale,
    balanceErrorMessage,
    userBalances,
    retryLoad: refreshData,
    vaultData,
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
