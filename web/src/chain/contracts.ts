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
  parseAbiItem,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { decodeContractError } from './errors';
import {
  MONAD_TESTNET_CHAIN_ID,
  LOCAL_CHAIN_ID,
  monadTestnetChain,
  getDeploymentsForChain,
  isDeployedOnMonad,
} from '../config/deployments';

import PrismVaultAbi from './abi/PrismVault.json';
import PrismAuctionAbi from './abi/PrismAuction.json';
import EpochCouponAbi from './abi/EpochCoupon.json';
import PrincipalTokenAbi from './abi/PrincipalToken.json';
import MockStockAbi from './abi/MockStock.json';
import MockUSDCAbi from './abi/MockUSDC.json';
import MockDividendSourceAbi from './abi/MockDividendSource.json';
import MockReferencePriceAbi from './abi/MockReferencePrice.json';

export { MONAD_TESTNET_CHAIN_ID, LOCAL_CHAIN_ID, monadTestnetChain };
export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';
export const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';

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
  MockReferencePrice?: Address;
  PrismFactory?: Address;
}

export function getActiveChainId(): number {
  return isDeployedOnMonad ? MONAD_TESTNET_CHAIN_ID : LOCAL_CHAIN_ID;
}

export function getActiveAddresses(chainId?: number): ContractAddresses {
  if (chainId !== undefined) {
    return getDeploymentsForChain(chainId);
  }
  return isDeployedOnMonad
    ? getDeploymentsForChain(MONAD_TESTNET_CHAIN_ID)
    : getDeploymentsForChain(LOCAL_CHAIN_ID);
}

export const DEPLOYED_ADDRESSES: ContractAddresses = {
  get MockStock() {
    return getActiveAddresses().MockStock;
  },
  get MockUSDC() {
    return getActiveAddresses().MockUSDC;
  },
  get MockDividendSource() {
    return getActiveAddresses().MockDividendSource;
  },
  get PrismVault() {
    return getActiveAddresses().PrismVault;
  },
  get PrincipalToken() {
    return getActiveAddresses().PrincipalToken;
  },
  get EpochCoupon() {
    return getActiveAddresses().EpochCoupon;
  },
  get PrismAuction() {
    return getActiveAddresses().PrismAuction;
  },
  get MockReferencePrice() {
    return getActiveAddresses().MockReferencePrice ?? '0x0000000000000000000000000000000000000000';
  },
  get PrismFactory() {
    return getActiveAddresses().PrismFactory ?? '0x0000000000000000000000000000000000000000';
  },
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

/**
 * Returns dev accounts only when chainId is 31337. Throws on any other chain.
 */
export function getDevAccounts(chainId: number = getActiveChainId()): typeof ANVIL_DEV_ACCOUNTS {
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error(
      `Burner or demo actors using Anvil keys are strictly prohibited on chain ${chainId}. Permitted only on local test chain ${LOCAL_CHAIN_ID}.`
    );
  }
  return ANVIL_DEV_ACCOUNTS;
}

export interface EpochData {
  epochId: number;
  exDate: bigint;
  payDate: bigint;
  funded: boolean;
  totalFundedUSDC: bigint;
  fundedSupply: bigint;
  isLive?: boolean;
  isAwaitingFunding?: boolean;
  isDefaulted?: boolean;
  graceEndsAt?: bigint;
  grossUsdcPerShare?: bigint;
  withholdingBps?: number;
  netUsdcPerShare?: bigint;
}

export function validateNonNegativeAmount(amount: bigint, fieldName: string = 'Amount'): void {
  if (amount <= 0n) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
}

export function validateWithinBalance(amount: bigint, balance: bigint, tokenName: string = 'token'): void {
  validateNonNegativeAmount(amount);
  if (amount > balance) {
    throw new Error(`Requested amount exceeds your available ${tokenName} balance.`);
  }
}

export function formatTimestampToDate(timestampInSeconds: bigint | number | undefined): string {
  if (timestampInSeconds === undefined || timestampInSeconds === null) return 'N/A';
  const sec = typeof timestampInSeconds === 'bigint' ? Number(timestampInSeconds) : timestampInSeconds;
  if (!Number.isFinite(sec) || sec <= 0) return 'N/A';
  const ms = sec > 1e11 ? sec : sec * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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

/**
 * Calculates current Dutch auction price at timestamp currentTime.
 * Linear decay: P(t) = startPrice - ((startPrice - floorPrice) * elapsed) / duration
 * Clamped deterministically between floorPrice and startPrice.
 */
export function calculateDutchPrice(
  startPrice: bigint,
  floorPrice: bigint,
  startTime: bigint,
  duration: bigint,
  currentTime: bigint
): bigint {
  if (currentTime <= startTime) return startPrice;
  const elapsed = currentTime - startTime;
  if (elapsed >= duration || duration === 0n) return floorPrice;
  const priceSpread = startPrice - floorPrice;
  const decay = (priceSpread * elapsed) / duration;
  return startPrice - decay;
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

export function getMonadPublicClient(rpcUrl: string = MONAD_RPC_URL): PublicClient {
  return createPublicClient({
    chain: monadTestnetChain,
    transport: http(rpcUrl),
  });
}

export function getPublicClient(chainId: number = LOCAL_CHAIN_ID): PublicClient {
  if (chainId === MONAD_TESTNET_CHAIN_ID) {
    return getMonadPublicClient();
  }
  return getLocalPublicClient();
}

export function getDevWalletClient(
  privateKey: `0x${string}`,
  rpcUrl: string = DEFAULT_RPC_URL,
  chainId: number = getActiveChainId()
): WalletClient {
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error(
      `Burner or demo actors using Anvil keys are strictly prohibited on chain ${chainId}. Permitted only on local test chain ${LOCAL_CHAIN_ID}.`
    );
  }
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: localAnvilChain,
    transport: http(rpcUrl),
  });
}

export function getInjectedWalletClient(chainId: number = LOCAL_CHAIN_ID): WalletClient | null {
  if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
    return null;
  }
  const chain = chainId === MONAD_TESTNET_CHAIN_ID ? monadTestnetChain : localAnvilChain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWalletClient({
    chain,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom((window as any).ethereum),
  });
}

// Internal typed write helper with chain gating and simulation
export async function callWriteContract(
  walletClient: WalletClient,
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args?: readonly unknown[]
): Promise<Hash> {
  const targetChainId = getActiveChainId();

  // Verify wallet chain matches targetChainId
  let walletChainId: number | undefined = walletClient.chain?.id;
  if (!walletChainId && typeof (walletClient as any).getChainId === 'function') {
    try {
      walletChainId = await (walletClient as any).getChainId();
    } catch {
      // ignore
    }
  }
  if (walletChainId && walletChainId !== targetChainId) {
    throw new Error(
      `Chain mismatch: wallet is connected to chain ${walletChainId}, but target chain is ${targetChainId}. Please switch network.`
    );
  }

  const pubClient = getPublicClient(targetChainId);
  const account = (walletClient as any).account;
  const targetChain = targetChainId === MONAD_TESTNET_CHAIN_ID ? monadTestnetChain : localAnvilChain;

  // Simulate contract call before sending to catch custom errors and revert conditions
  try {
    if (typeof pubClient.simulateContract === 'function') {
      await pubClient.simulateContract({
        address,
        abi: abi as Abi,
        functionName,
        args: (args ?? []) as any,
        account,
      });
    }
  } catch (simError: any) {
    throw new Error(decodeContractError(simError));
  }

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

  try {
    return await clientAny.writeContract({
      address,
      abi,
      functionName,
      args: args ?? [],
      chain: targetChain,
      account: clientAny.account ?? account,
    });
  } catch (writeError: any) {
    throw new Error(decodeContractError(writeError));
  }
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

  const [epochCountBig, demoMode, latestBlock] = await Promise.all([
    vault.read.epochCount(),
    vault.read.demoMode(),
    publicClient.getBlock(),
  ]);

  const count = Number(epochCountBig);
  const epochs: EpochData[] = [];

  for (let i = 1; i <= count; i++) {
    const epochInfo = (await vault.read.getEpoch([BigInt(i)])) as [bigint, bigint, boolean, bigint, bigint];
    let isLive = false;
    let isAwaitingFunding = false;
    let isDefaulted = false;
    let graceEndsAt = 0n;
    try {
      const status = (await vault.read.fundingStatus([BigInt(i)])) as [boolean, boolean, boolean, bigint];
      isLive = status[0];
      isAwaitingFunding = status[1];
      isDefaulted = status[2];
      graceEndsAt = status[3];
    } catch {
      // Fallback if not supported
    }
    let grossUsdcPerShare = 0n;
    let withholdingBps = 0;
    let netUsdcPerShare = 0n;
    try {
      const divSource = getContract({
        address: DEPLOYED_ADDRESSES.MockDividendSource,
        abi: MockDividendSourceAbi,
        client: publicClient,
      });
      const ev = (await divSource.read.getEvent([BigInt(i)])) as [boolean, number, bigint, bigint, boolean];
      if (ev[0]) {
        grossUsdcPerShare = ev[2];
        withholdingBps = Number(ev[3]);
        netUsdcPerShare = (grossUsdcPerShare * BigInt(10000 - withholdingBps)) / 10000n;
      }
    } catch {
      // Fallback if not configured
    }

    epochs.push({
      epochId: i,
      exDate: epochInfo[0],
      payDate: epochInfo[1],
      funded: epochInfo[2],
      totalFundedUSDC: epochInfo[3],
      fundedSupply: epochInfo[4],
      isLive,
      isAwaitingFunding,
      isDefaulted,
      graceEndsAt,
      grossUsdcPerShare,
      withholdingBps,
      netUsdcPerShare,
    });
  }

  return {
    epochCount: count,
    demoMode: Boolean(demoMode),
    latestBlockTimestamp: latestBlock.timestamp,
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

  const logs = await publicClient.getLogs({
    address: DEPLOYED_ADDRESSES.PrismAuction,
    event: parseAbiItem(
      'event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 indexed epochId, uint256 amount, uint256 startPrice, uint256 floorPrice, uint256 duration, uint256 startTime)'
    ),
    fromBlock: 0n,
  });

  const ids = Array.from(new Set(logs.map((l) => Number(l.args.auctionId))));
  const list: AuctionView[] = [];

  for (const id of ids) {
    try {
      const data = (await auction.read.getAuction([BigInt(id)])) as any;
      const seller: Address = data.seller ?? data[0] ?? '0x0000000000000000000000000000000000000000';
      const epochId = Number(data.epochId ?? data[1] ?? 1);
      const remainingAmount: bigint = data.amount ?? data[2] ?? 0n;
      const totalAmount: bigint = data.initialAmount ?? data[3] ?? 0n;
      const startPrice: bigint = data.startPrice ?? data[4] ?? 0n;
      const floorPrice: bigint = data.floorPrice ?? data[5] ?? 0n;
      const startTime: bigint = data.startTime ?? data[6] ?? 0n;
      const duration: bigint = data.duration ?? data[7] ?? 0n;
      const active: boolean = Boolean(data.active ?? data[8]);

      let curPrice = 0n;
      if (active) {
        try {
          curPrice = (await auction.read.currentPrice([BigInt(id)])) as bigint;
        } catch {
          curPrice = floorPrice;
        }
      }

      list.push({
        auctionId: id,
        seller,
        epochId,
        totalAmount,
        remainingAmount,
        startPrice,
        floorPrice,
        startTime,
        duration,
        active,
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

export async function fetchReferencePrice(
  publicClient: PublicClient
): Promise<{ price: bigint; updatedAt: bigint } | null> {
  const addr = DEPLOYED_ADDRESSES.MockReferencePrice;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const contract = getContract({
      address: addr,
      abi: MockReferencePriceAbi,
      client: publicClient,
    });
    const [price, updatedAt] = (await contract.read.price()) as [bigint, bigint];
    return { price, updatedAt };
  } catch {
    return null;
  }
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
  validateNonNegativeAmount(amount, 'Deposit amount');
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'deposit', [amount]);
}

export async function recombineShares(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  validateNonNegativeAmount(amount, 'Recombine amount');
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'recombine', [amount]);
}

export async function redeemPrincipal(walletClient: WalletClient, amount: bigint): Promise<Hash> {
  validateNonNegativeAmount(amount, 'Redeem amount');
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'redeemPrincipal', [
    amount,
  ]);
}

export async function claimDividend(
  walletClient: WalletClient,
  epochId: number,
  amount: bigint
): Promise<Hash> {
  if (epochId <= 0) throw new Error('Epoch ID must be greater than zero.');
  validateNonNegativeAmount(amount, 'Claim amount');
  return callWriteContract(walletClient, DEPLOYED_ADDRESSES.PrismVault, PrismVaultAbi, 'claim', [
    BigInt(epochId),
    amount,
  ]);
}

export async function fundEpoch(walletClient: WalletClient, epochId: number): Promise<Hash> {
  if (epochId <= 0) throw new Error('Epoch ID must be greater than zero.');
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
  if (epochId <= 0) throw new Error('Epoch ID must be greater than zero.');
  validateNonNegativeAmount(amount, 'Auction amount');
  validateNonNegativeAmount(startPrice, 'Start price');
  validateNonNegativeAmount(floorPrice, 'Floor price');
  if (startPrice < floorPrice) {
    throw new Error('Start price cannot be lower than floor price.');
  }
  validateNonNegativeAmount(durationSeconds, 'Duration');
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
  if (epochIds.length === 0) throw new Error('At least one epoch must be provided.');
  validateNonNegativeAmount(durationSeconds, 'Duration');
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
  if (auctionId <= 0) throw new Error('Auction ID must be greater than zero.');
  validateNonNegativeAmount(amount, 'Buy amount');
  validateNonNegativeAmount(maxPrice, 'Max price');
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
// Balance State Machine UI Helpers
// -----------------------------------------------------------------------------

export type BalanceLoadStatus = 'loading' | 'loaded' | 'error' | 'not-deployed';

export function formatBalanceStateValue(
  status: BalanceLoadStatus,
  val: bigint | undefined,
  formatter: (v: bigint) => string
): string {
  if (status === 'loading') return '...';
  if (status === 'loaded' && val !== undefined) return formatter(val);
  return '--';
}

export function computeDepositState({
  balanceStatus,
  stockBalance,
  parsedDeposit,
  needsApproval,
  isSubmitting,
}: {
  balanceStatus: BalanceLoadStatus;
  stockBalance: bigint;
  parsedDeposit: bigint;
  needsApproval: boolean;
  isSubmitting: boolean;
}): {
  hasInsufficientStock: boolean;
  disabled: boolean;
  buttonText: string;
} {
  const isLoaded = balanceStatus === 'loaded';
  const hasInsufficientStock = isLoaded && parsedDeposit > stockBalance;

  let buttonText = 'DEPOSIT & BIFURCATE';
  let disabled = isSubmitting;

  if (balanceStatus === 'loading') {
    buttonText = 'LOADING BALANCES...';
    disabled = true;
  } else if (balanceStatus === 'not-deployed') {
    buttonText = 'CONTRACTS NOT DEPLOYED';
    disabled = true;
  } else if (balanceStatus === 'error') {
    buttonText = 'ERROR LOADING BALANCES';
    disabled = true;
  } else if (hasInsufficientStock) {
    buttonText = 'INSUFFICIENT mSTOCK BALANCE';
    disabled = true;
  } else if (parsedDeposit === 0n) {
    buttonText = 'ENTER AMOUNT';
    disabled = true;
  } else if (isSubmitting) {
    buttonText = needsApproval ? 'APPROVING...' : 'DEPOSITING...';
    disabled = true;
  } else {
    buttonText = needsApproval ? 'APPROVE mSTOCK' : 'DEPOSIT & BIFURCATE';
    disabled = false;
  }

  return { hasInsufficientStock, disabled, buttonText };
}

export function computeRecombineState({
  balanceStatus,
  canRecombine,
  isSubmitting,
}: {
  balanceStatus: BalanceLoadStatus;
  canRecombine: boolean;
  isSubmitting: boolean;
}): {
  disabled: boolean;
  buttonText: string;
} {
  let buttonText = 'RECOMBINE & UNLOCK SHARE';
  let disabled = isSubmitting;

  if (balanceStatus === 'loading') {
    buttonText = 'LOADING BALANCES...';
    disabled = true;
  } else if (balanceStatus === 'not-deployed') {
    buttonText = 'CONTRACTS NOT DEPLOYED';
    disabled = true;
  } else if (balanceStatus === 'error') {
    buttonText = 'ERROR LOADING BALANCES';
    disabled = true;
  } else if (isSubmitting) {
    buttonText = 'RECOMBINING...';
    disabled = true;
  } else if (!canRecombine) {
    buttonText = 'INELIGIBLE TO RECOMBINE';
    disabled = true;
  } else {
    buttonText = 'RECOMBINE & UNLOCK SHARE';
    disabled = false;
  }

  return { disabled, buttonText };
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
    'declareEvent',
    [BigInt(epochId), 0, amountPerShareUSDC]
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
