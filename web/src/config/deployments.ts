import { type Address, defineChain, type Chain } from 'viem';
import monadDeploymentsRaw from '../../../deployments/monad-testnet.json';
import localDeploymentsRaw from '../chain/deployments.local.json';

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const LOCAL_CHAIN_ID = 31337;

export const monadTestnetChain: Chain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadexplorer.com' },
  },
});

export interface DeploymentManifest {
  chainId: number;
  contracts: {
    MockStock: Address;
    MockUSDC: Address;
    MockDividendSource: Address;
    PrismVault: Address;
    PrincipalToken: Address;
    EpochCoupon: Address;
    PrismAuction: Address;
  };
}

export const monadDeployments: DeploymentManifest = monadDeploymentsRaw as unknown as DeploymentManifest;
export const localDeployments: DeploymentManifest = localDeploymentsRaw as unknown as DeploymentManifest;

/**
 * Checks if a contract address is deployed and non-zero.
 */
export function isRealAddress(address: string | undefined): boolean {
  if (!address) return false;
  const clean = address.trim().toLowerCase();
  return clean.startsWith('0x') && clean.length === 42 && clean !== '0x0000000000000000000000000000000000000000';
}

/**
 * Indicates if the contracts have been deployed on Monad testnet.
 */
export const isDeployedOnMonad: boolean = Boolean(
  isRealAddress(monadDeployments?.contracts?.PrismVault) &&
  isRealAddress(monadDeployments?.contracts?.PrismAuction)
);

/**
 * Returns active deployment contracts based on connected chain ID.
 */
export function getDeploymentsForChain(chainId: number): DeploymentManifest['contracts'] {
  if (chainId === MONAD_TESTNET_CHAIN_ID && isDeployedOnMonad) {
    return monadDeployments.contracts;
  }
  return localDeployments.contracts;
}
