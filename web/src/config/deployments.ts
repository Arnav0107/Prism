import { type Address, defineChain, type Chain, type PublicClient, createPublicClient, http } from 'viem';
import monadDeploymentsRaw from '../../../deployments/monad-testnet.json';
import localDeploymentsRaw from '../chain/deployments.local.json';

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const LOCAL_CHAIN_ID = 31337;
export const MONAD_EXPLORER_URL = 'https://testnet.monadvision.com';

export const monadTestnetChain: Chain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: MONAD_EXPLORER_URL },
  },
});

export interface ContractAddresses {
  MockStock: Address;
  MockUSDC: Address;
  MockDividendSource: Address;
  PrismVault: Address;
  PrincipalToken: Address;
  EpochCoupon: Address;
  PrismAuction: Address;
  MockReferencePrice?: Address;
}

export interface DeploymentManifest {
  chainId: number;
  contracts: ContractAddresses;
}

const rawMonad = monadDeploymentsRaw as any;
export const monadDeployments: DeploymentManifest = (
  rawMonad?.contracts
    ? rawMonad
    : {
        chainId: rawMonad?.chainId || 10143,
        contracts: rawMonad as ContractAddresses,
      }
) as DeploymentManifest;

export const localDeployments: DeploymentManifest = localDeploymentsRaw as unknown as DeploymentManifest;

/**
 * Checks if a contract address is deployed, valid hex format, and non-zero.
 */
export function isRealAddress(address: string | undefined): boolean {
  if (!address) return false;
  const clean = address.trim().toLowerCase();
  return clean.startsWith('0x') && clean.length === 42 && clean !== '0x0000000000000000000000000000000000000000';
}

/**
 * Validates that all required protocol contracts are present with non-zero addresses.
 */
export function validateContractAddresses(addresses: Partial<ContractAddresses> | undefined): {
  valid: boolean;
  missing: (keyof ContractAddresses)[];
} {
  const required: (keyof ContractAddresses)[] = [
    'MockStock',
    'MockUSDC',
    'MockDividendSource',
    'PrismVault',
    'PrincipalToken',
    'EpochCoupon',
    'PrismAuction',
  ];
  const missing: (keyof ContractAddresses)[] = [];
  if (!addresses) {
    return { valid: false, missing: required };
  }
  for (const name of required) {
    if (!isRealAddress(addresses[name])) {
      missing.push(name);
    }
  }
  return { valid: missing.length === 0, missing };
}

/**
 * Verifies on-chain bytecode at the PrismVault and PrismAuction addresses via Monad RPC.
 * Static address presence is not enough; requires active deployed bytecode.
 */
export async function verifyMonadDeployment(client?: PublicClient): Promise<boolean> {
  const vaultAddr = monadDeployments?.contracts?.PrismVault;
  const auctionAddr = monadDeployments?.contracts?.PrismAuction;

  if (!isRealAddress(vaultAddr) || !isRealAddress(auctionAddr)) {
    return false;
  }

  try {
    const pubClient =
      client ??
      createPublicClient({
        chain: monadTestnetChain,
        transport: http('https://testnet-rpc.monad.xyz'),
      });

    const [vaultCode, auctionCode] = await Promise.all([
      pubClient.getBytecode({ address: vaultAddr as Address }),
      pubClient.getBytecode({ address: auctionAddr as Address }),
    ]);

    const hasVault = Boolean(vaultCode && vaultCode !== '0x' && vaultCode.length > 2);
    const hasAuction = Boolean(auctionCode && auctionCode !== '0x' && auctionCode.length > 2);

    return hasVault && hasAuction;
  } catch {
    return false;
  }
}

/**
 * Indicates if the contracts have real address entries configured for Monad testnet.
 */
export const isDeployedOnMonad: boolean = Boolean(
  isRealAddress(monadDeployments?.contracts?.PrismVault) &&
  isRealAddress(monadDeployments?.contracts?.PrismAuction)
);

/**
 * Returns active deployment contracts based on connected chain ID.
 */
export function getDeploymentsForChain(chainId: number): ContractAddresses {
  if (chainId === MONAD_TESTNET_CHAIN_ID && isDeployedOnMonad) {
    return monadDeployments.contracts;
  }
  return localDeployments.contracts;
}

export type NetworkHealthStatus = 'loaded' | 'rpc_unreachable' | 'not_deployed' | 'missing_config';

export interface NetworkHealth {
  status: NetworkHealthStatus;
  message: string;
  isReady: boolean;
}

/**
 * Verifies RPC connectivity, address presence, and active bytecode on-chain.
 */
export async function checkNetworkHealth(
  publicClient: PublicClient,
  addresses: ContractAddresses,
  chainId: number
): Promise<NetworkHealth> {
  // 1. Check RPC connection
  try {
    await publicClient.getBlockNumber();
  } catch {
    const rpcUrl = chainId === 31337 ? 'http://127.0.0.1:8545' : 'https://testnet-rpc.monad.xyz';
    return {
      status: 'rpc_unreachable',
      message: `RPC unreachable at ${rpcUrl}. Ensure local Anvil node is running.`,
      isReady: false,
    };
  }

  // 2. Check address configuration
  const validation = validateContractAddresses(addresses);
  if (!validation.valid) {
    return {
      status: 'missing_config',
      message: `Contracts not configured for chain ${chainId} (missing: ${validation.missing.join(', ')}). Run scripts/deploy-local.`,
      isReady: false,
    };
  }

  // 3. Check bytecode on-chain (detect stale addresses or restarted Anvil)
  try {
    const [vaultCode, stockCode] = await Promise.all([
      publicClient.getBytecode({ address: addresses.PrismVault }),
      publicClient.getBytecode({ address: addresses.MockStock }),
    ]);

    const hasVault = vaultCode && vaultCode !== '0x' && vaultCode.length > 2;
    const hasStock = stockCode && stockCode !== '0x' && stockCode.length > 2;

    if (!hasVault || !hasStock) {
      return {
        status: 'not_deployed',
        message: 'Contracts not found on this chain — run scripts/deploy-local (or restart Anvil)',
        isReady: false,
      };
    }
  } catch (err) {
    return {
      status: 'not_deployed',
      message: `Failed to verify contract bytecode: ${err instanceof Error ? err.message : String(err)}. Run scripts/deploy-local.`,
      isReady: false,
    };
  }

  return {
    status: 'loaded',
    message: `Connected to Chain ${chainId}. Contracts verified.`,
    isReady: true,
  };
}
