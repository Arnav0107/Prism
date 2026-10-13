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

function loadDeployments(chainId: number): Record<string, string> {
  const deploymentFile =
    chainId === 10143
      ? path.resolve(process.cwd(), '../deployments/monad-testnet.json')
      : path.resolve(process.cwd(), '../web/src/chain/deployments.local.json');

  if (fs.existsSync(deploymentFile)) {
    try {
      const raw = fs.readFileSync(deploymentFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.contracts) return parsed.contracts;
      return parsed;
    } catch (err) {
      logger.warn(`Failed reading deployments file at ${deploymentFile}:`, { err });
    }
  }
  return {};
}

export async function loadConfig(): Promise<KeeperConfig> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';

  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';

  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      'Missing PRIVATE_KEY environment variable. A valid private key is required to run the keeper.'
    );
  }

  const privateKeyRaw = process.env.PRIVATE_KEY.trim();
  const privateKey = (privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const baseClient = createPublicClient({
    transport: http(rpcUrl),
  });

  const chainId = process.env.CHAIN_ID
    ? parseInt(process.env.CHAIN_ID, 10)
    : await baseClient.getChainId();

  const deployments = loadDeployments(chainId);

  const vaultAddress = (process.env.PRISM_VAULT_ADDRESS || deployments.PrismVault) as Address;
  const auctionAddress = (process.env.PRISM_AUCTION_ADDRESS || deployments.PrismAuction) as Address;
  const couponAddress = (process.env.EPOCH_COUPON_ADDRESS || deployments.EpochCoupon) as Address;
  const usdcAddress = (process.env.MOCK_USDC_ADDRESS || deployments.MockUSDC) as Address;

  if (!vaultAddress || !auctionAddress || !couponAddress || !usdcAddress) {
    throw new Error(
      `Missing contract addresses for chain ${chainId}. Specify PRISM_VAULT_ADDRESS, PRISM_AUCTION_ADDRESS, EPOCH_COUPON_ADDRESS, MOCK_USDC_ADDRESS in .env or run deploy first.`
    );
  }

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
  const maxFeePerGasGwei = parseUnits(process.env.MAX_FEE_PER_GAS_GWEI || '50', 9);
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);

  const customChain = defineChain({
    id: chainId,
    name: chainId === 10143 ? 'Monad Testnet' : chainId === 31337 ? 'Anvil' : `Chain ${chainId}`,
    nativeCurrency:
      chainId === 10143
        ? { name: 'Monad', symbol: 'MON', decimals: 18 }
        : { name: 'Ether', symbol: 'ETH', decimals: 18 },
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

