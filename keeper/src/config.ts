import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  defineChain,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from './logger.js';

dotenv.config();

export interface KeeperConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  vaultAddress: Address;
  auctionAddress: Address;
  couponAddress: Address;
  usdcAddress: Address;
  pollIntervalMs: number;
  maxFeePerGasGwei: bigint;
  maxRetries: number;
  dryRun: boolean;
  publicClient: PublicClient;
  walletClient: WalletClient;
  accountAddress: Address;
}

function loadLocalDeployments(): Record<string, string> {
  const possiblePaths = [
    path.resolve(process.cwd(), '../web/src/chain/deployments.local.json'),
    path.resolve(process.cwd(), 'deployments.local.json'),
    path.resolve(process.cwd(), '../deployments/monad-testnet.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.contracts) return parsed.contracts;
      } catch (err) {
        logger.warn(`Failed reading deployments file at ${p}:`, { err });
      }
    }
  }
  return {};
}

export function loadConfig(): KeeperConfig {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';

  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const privateKeyRaw = (process.env.PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`;

  const privateKey = (privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const localContracts = loadLocalDeployments();

  const vaultAddress = (process.env.PRISM_VAULT_ADDRESS || localContracts.PrismVault) as Address;
  const auctionAddress = (process.env.PRISM_AUCTION_ADDRESS || localContracts.PrismAuction) as Address;
  const couponAddress = (process.env.EPOCH_COUPON_ADDRESS || localContracts.EpochCoupon) as Address;
  const usdcAddress = (process.env.MOCK_USDC_ADDRESS || localContracts.MockUSDC) as Address;

  if (!vaultAddress || !auctionAddress || !couponAddress || !usdcAddress) {
    throw new Error(
      'Missing contract addresses. Specify PRISM_VAULT_ADDRESS, PRISM_AUCTION_ADDRESS, EPOCH_COUPON_ADDRESS, MOCK_USDC_ADDRESS in .env or run local deploy first.'
    );
  }

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
  const maxFeePerGasGwei = parseUnits(process.env.MAX_FEE_PER_GAS_GWEI || '50', 9);
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);

  const customChain = defineChain({
    id: 31337,
    name: 'Prism Network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  });

  const publicClient = createPublicClient({
    chain: customChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: customChain,
    transport: http(rpcUrl),
  });

  return {
    rpcUrl,
    privateKey,
    vaultAddress,
    auctionAddress,
    couponAddress,
    usdcAddress,
    pollIntervalMs,
    maxFeePerGasGwei,
    maxRetries,
    dryRun,
    publicClient,
    walletClient,
    accountAddress: account.address,
  };
}
