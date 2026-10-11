import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  parseUnits,
  formatUnits,
  type Hash,
  getContract,
  defineChain,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import deploymentsLocal from './deployments.local.json';

import PrismVaultAbi from './abi/PrismVault.json';
import PrismAuctionAbi from './abi/PrismAuction.json';
import EpochCouponAbi from './abi/EpochCoupon.json';
import PrincipalTokenAbi from './abi/PrincipalToken.json';
import MockStockAbi from './abi/MockStock.json';
import MockUSDCAbi from './abi/MockUSDC.json';
import MockDividendSourceAbi from './abi/MockDividendSource.json';

export const LOCAL_CHAIN_ID = 31337;
export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

export const localAnvilChain: Chain = defineChain({
  id: 31337,
  name: 'Anvil Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [DEFAULT_RPC_URL] },
  },
});

export const COUPON_PRECISION = 10n ** 18n; // 1e18
export const USDC_PRECISION = 10n ** 6n;   // 1e6
export const STOCK_PRECISION = 10n ** 18n;  // 1e18

export interface ContractAddresses {
  MockStock: Address;
  MockUSDC: Address;
  MockDividendSource: Address;
  PrismVault: Address;
  PrincipalToken: Address;
  EpochCoupon: Address;
  PrismAuction: Address;
}

export const DEPLOYED_ADDRESSES: ContractAddresses = {
  MockStock: (deploymentsLocal.contracts.MockStock || '0x0') as Address,
  MockUSDC: (deploymentsLocal.contracts.MockUSDC || '0x0') as Address,
  MockDividendSource: (deploymentsLocal.contracts.MockDividendSource || '0x0') as Address,
  PrismVault: (deploymentsLocal.contracts.PrismVault || '0x0') as Address,
  PrincipalToken: (deploymentsLocal.contracts.PrincipalToken || '0x0') as Address,
  EpochCoupon: (deploymentsLocal.contracts.EpochCoupon || '0x0') as Address,
  PrismAuction: (deploymentsLocal.contracts.PrismAuction || '0x0') as Address,
};

export const ANVIL_DEV_ACCOUNTS = [
  {
    name: 'Deployer (Treasury)',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
  },
  {
    name: 'Account 1 (Alice / Buyer)',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`,
  },
  {
    name: 'Account 2 (Bob / Seller)',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as `0x${string}`,
  },
  {
    name: 'Account 3 (Market Maker)',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as Address,
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as `0x${string}`,
  },
];

export interface EpochData {
  epochId: number;
  exDate: bigint;
  payDate: bigint;
  funded: boolean;
  totalFundedUSDC: bigint;
  fundedSupply: bigint;
}

export interface AuctionView {
  auctionId: number;
  seller: Address;
  epochId: number;
  totalAmount: bigint;
  remainingAmount: bigint;
  startPrice: bigint;
  floorPrice: bigint;
  startTime: bigint;
  duration: bigint;
  active: boolean;
  currentPrice: bigint;
}

// -----------------------------------------------------------------------------
// Math & Formatting Utilities
// -----------------------------------------------------------------------------

/**
 * Calculates buy cost rounded UP to match Math.mulDiv(amount, price, COUPON_PRECISION, Ceil).
 * @param amountInWei Quantity of coupons (1e18 base units)
 * @param priceInUsdcBaseUnits Price in USDC (1e6 base units per 1e18 coupon)
 * @returns Total cost in USDC base units (1e6)
 */
export function calculateBuyCostCeil(amountInWei: bigint, priceInUsdcBaseUnits: bigint): bigint {
  if (amountInWei === 0n || priceInUsdcBaseUnits === 0n) return 0n;
  const numerator = amountInWei * priceInUsdcBaseUnits;
  return (numerator + COUPON_PRECISION - 1n) / COUPON_PRECISION;
}

export function formatStock(amount: bigint): string {
  const num = Number(formatUnits(amount, 18));
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatUsdc(amount: bigint): string {
  const num = Number(formatUnits(amount, 6));
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatUsdcPrice(price: bigint): string {
  const num = Number(formatUnits(price, 6));
  return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function parseStock(input: string): bigint {
  const clean = input.trim();
  if (!clean || isNaN(Number(clean))) return 0n;
  return parseUnits(clean, 18);
}

export function parseUsdc(input: string): bigint {
  const clean = input.trim();
  if (!clean || isNaN(Number(clean))) return 0n;
  return parseUnits(clean, 6);
}

// -----------------------------------------------------------------------------
// Viem Clients
// -----------------------------------------------------------------------------

export function getLocalPublicClient(rpcUrl: string = DEFAULT_RPC_URL): PublicClient {
  return createPublicClient({
    chain: localAnvilChain,
    transport: http(rpcUrl),
  });
}

export function getDevWalletClient(privateKey: `0x${string}`, rpcUrl: string = DEFAULT_RPC_URL): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: localAnvilChain,
    transport: http(rpcUrl),
  });
}

export function getInjectedWalletClient(): WalletClient | null {
  if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWalletClient({
    chain: localAnvilChain,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom((window as any).ethereum),
  });
}

// Internal typed write helper
async function callWriteContract(
  walletClient: WalletClient,
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args?: readonly unknown[]
): Promise<Hash> {
  const clientAny = walletClient as unknown as {
    writeContract: (params: {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
      chain?: Chain;
      account?: unknown;
    }) => Promise<Hash>;
    account?: unknown;
  };

  return clientAny.writeContract({
    address,
    abi,
    functionName,
    args: args ?? [],
    chain: localAnvilChain,
    account: clientAny.account,
  });
}

// -----------------------------------------------------------------------------
// Adapter: Core Contract Read Operations
// -----------------------------------------------------------------------------

export async function fetchVaultOverview(publicClient: PublicClient) {
  const vault = getContract({
    address: DEPLOYED_ADDRESSES.PrismVault,
    abi: PrismVaultAbi,
    client: publicClient,
  });

  const [epochCountBig, demoMode] = await Promise.all([
    vault.read.epochCount(),
    vault.read.demoMode(),
  ]);

  const count = Number(epochCountBig);
  const epochs: EpochData[] = [];

  for (let i = 1; i <= count; i++) {
    const epochInfo = (await vault.read.getEpoch([BigInt(i)])) as [bigint, bigint, boolean, bigint, bigint];
    epochs.push({
      epochId: i,
      exDate: epochInfo[0],
      payDate: epochInfo[1],
      funded: epochInfo[2],
      totalFundedUSDC: epochInfo[3],
      fundedSupply: epochInfo[4],
    });
  }

  return {
    epochCount: count,
    demoMode,
    epochs,
  };
}

export async function fetchUserBalances(publicClient: PublicClient, userAddress: Address, epochCount: number) {
  const stock = getContract({ address: DEPLOYED_ADDRESSES.MockStock, abi: MockStockAbi, client: publicClient });
  const usdc = getContract({ address: DEPLOYED_ADDRESSES.MockUSDC, abi: MockUSDCAbi, client: publicClient });
  const pt = getContract({ address: DEPLOYED_ADDRESSES.PrincipalToken, abi: PrincipalTokenAbi, client: publicClient });
  const ec = getContract({ address: DEPLOYED_ADDRESSES.EpochCoupon, abi: EpochCouponAbi, client: publicClient });

  const [stockBalance, usdcBalance, ptBalance, stockAllowanceVault, usdcAllowanceVault, usdcAllowanceAuction] = await Promise.all([
    stock.read.balanceOf([userAddress]) as Promise<bigint>,
    usdc.read.balanceOf([userAddress]) as Promise<bigint>,
    pt.read.balanceOf([userAddress]) as Promise<bigint>,
    stock.read.allowance([userAddress, DEPLOYED_ADDRESSES.PrismVault]) as Promise<bigint>,
    usdc.read.allowance([userAddress, DEPLOYED_ADDRESSES.PrismVault]) as Promise<bigint>,
    usdc.read.allowance([userAddress, DEPLOYED_ADDRESSES.PrismAuction]) as Promise<bigint>,
  ]);

  const isAuctionApprovedCoupons = (await ec.read.isApprovedForAll([
    userAddress,
    DEPLOYED_ADDRESSES.PrismAuction,
  ])) as boolean;

  const couponBalances: Record<number, bigint> = {};
  for (let i = 1; i <= epochCount; i++) {
    const bal = (await ec.read.balanceOf([userAddress, BigInt(i)])) as bigint;
    couponBalances[i] = bal;
  }

  return {
    stockBalance,
    usdcBalance,
    ptBalance,
    stockAllowanceVault,
    usdcAllowanceVault,
    usdcAllowanceAuction,
    isAuctionApprovedCoupons,
    couponBalances,
  };
}

export async function fetchMarketAuctions(publicClient: PublicClient): Promise<AuctionView[]> {
  const auction = getContract({
    address: DEPLOYED_ADDRESSES.PrismAuction,
    abi: PrismAuctionAbi,
    client: publicClient,
  });

  const nextIdBig = (await auction.read.nextAuctionId()) as bigint;
  const total = Number(nextIdBig);
  const list: AuctionView[] = [];

  for (let id = 1; id < total; id++) {
    try {
      const data = (await auction.read.getAuction([BigInt(id)])) as [
        Address,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        boolean
      ];

      let curPrice = 0n;
      if (data[8]) {
        try {
          curPrice = (await auction.read.currentPrice([BigInt(id)])) as bigint;
        } catch {
          curPrice = data[5]; // fallback floor
        }
      }

      list.push({
        auctionId: id,
        seller: data[0],
        epochId: Number(data[1]),
        totalAmount: data[2],
        remainingAmount: data[3],
        startPrice: data[4],
        floorPrice: data[5],
        startTime: data[6],
        duration: data[7],
        active: data[8],
        currentPrice: curPrice,
      });
    } catch {
      // Auction query failed or inactive
    }
  }

  return list;
}

export async function fetchEpochMarketData(publicClient: PublicClient, epochId: number) {
  const auction = getContract({
    address: DEPLOYED_ADDRESSES.PrismAuction,
    abi: PrismAuctionAbi,
    client: publicClient,
  });

  const [lastClearingPrice, cumulativeVolume] = (await auction.read.getEpochMarketData([
    BigInt(epochId),
  ])) as [bigint, bigint];

  return {
    lastClearingPrice,
    cumulativeVolume,
  };
}

// -----------------------------------------------------------------------------
// Adapter: Core Contract Write Operations
// -----------------------------------------------------------------------------

export async function approveStock(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.MockStock, MockStockAbi, 'approve', [
    DEPLOYED_ADDRESSES.PrismVault,
    amount,
  ]);
}

export async function approveUsdc(
  walletClient: WalletClient,
  spender: Address,
  amount: bigint
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.MockUSDC, MockUSDCAbi, 'approve', [
    spender,
    amount,
  ]);
}

export async function approveCouponsForAuction(
  walletClient: WalletClient,
  approved: boolean = true
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.EpochCoupon, EpochCouponAbi, 'setApprovalForAll', [
    DEPLOYED_ADDRESSES.PrismAuction,
    approved,
  ]);
}

export async function depositShares(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'deposit', [amount]);
}

export async function recombineShares(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'recombine', [amount]);
}

export async function redeemPrincipal(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'redeemPrincipal', [
    amount,
  ]);
}

export async function claimDividend(
  walletClient: WalletClient,
  epochId: number,
  amount: bigint
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'claim', [
    BigInt(epochId),
    amount,
  ]);
}

export async function fundEpoch(walletClient: WalletClient, epochId: number): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'fundEpoch', [
    BigInt(epochId),
  ]);
}

export async function createAuction(
  walletClient: WalletClient,
  epochId: number,
  amount: bigint,
  startPrice: bigint,
  floorPrice: bigint,
  durationSeconds: bigint
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismAuction, PrismAuctionAbi, 'createAuction', [
    BigInt(epochId),
    amount,
    startPrice,
    floorPrice,
    durationSeconds,
  ]);
}

export async function createBatchAuctions(
  walletClient: WalletClient,
  epochIds: number[],
  amounts: bigint[],
  startPrices: bigint[],
  floorPrices: bigint[],
  durationSeconds: bigint
): Promise<Hash> {
  return callWriteContract(
    walletClient,
    DEPLOYED_ADDRESSES.PrismAuction,
    PrismAuctionAbi,
    'createBatchAuctions',
    [
      epochIds.map((id) => BigInt(id)),
      amounts,
      startPrices,
      floorPrices,
      durationSeconds,
    ]
  );
}

export async function buyAuction(
  walletClient: WalletClient,
  auctionId: number,
  amount: bigint,
  maxPrice: bigint
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismAuction, PrismAuctionAbi, 'buy', [
    BigInt(auctionId),
    amount,
    maxPrice,
  ]);
}

export async function cancelAuction(
  walletClient: WalletClient,
  auctionId: number
): Promise<Hash> {
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismAuction, PrismAuctionAbi, 'cancel', [
    BigInt(auctionId),
  ]);
}

// -----------------------------------------------------------------------------
// Local Anvil Demo Drawer Calls (chainId 31337 only)
// -----------------------------------------------------------------------------

export async function mintMockTokens(
  walletClient: WalletClient,
  token: 'stock' | 'usdc',
  recipient: Address,
  amount: bigint
): Promise<Hash> {
  const address = token === 'stock' ? DEPLOYED_ADDRESSES.MockStock : DEPLOYED_ADDRESSES.MockUSDC;
  const abi = token === 'stock' ? MockStockAbi : MockUSDCAbi;

  return callWriteContract(walletClient, address, abi, 'mint', [recipient, amount]);
}

export async function declareDividend(
  walletClient: WalletClient,
  epochId: number,
  amountPerShareUSDC: bigint
): Promise<Hash> {
  return callWriteContract(
    walletClient,
    DEPLOYED_ADDRESSES.MockDividendSource,
    MockDividendSourceAbi,
    'declareDividend',
    [BigInt(epochId), amountPerShareUSDC]
  );
}

export async function anvilIncreaseTime(rpcUrl: string, seconds: number) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'anvil_increaseTime',
      params: [seconds],
      id: Date.now(),
    }),
  });
  return response.json();
}

export async function anvilMine(rpcUrl: string, blocks: number = 1) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'anvil_mine',
      params: [blocks],
      id: Date.now(),
    }),
  });
  return response.json();
}
