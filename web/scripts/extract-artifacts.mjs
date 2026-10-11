import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const runLatestPath = path.join(projectRoot, 'broadcast/Deploy.s.sol/31337/run-latest.json');
const outDir = path.join(projectRoot, 'out');
const chainDir = path.join(projectRoot, 'web/src/chain');
const abiDir = path.join(chainDir, 'abi');

fs.mkdirSync(abiDir, { recursive: true });

// 1. Extract addresses from run-latest.json
if (!fs.existsSync(runLatestPath)) {
  console.error(`run-latest.json not found at ${runLatestPath}. Run Deploy.s.sol first.`);
  process.exit(1);
}

const runLatest = JSON.parse(fs.readFileSync(runLatestPath, 'utf8'));
const deployments = {
  chainId: 31337,
  contracts: {}
};

for (const tx of runLatest.transactions || []) {
  if (tx.transactionType === 'CREATE' && tx.contractName && tx.contractAddress) {
    deployments.contracts[tx.contractName] = tx.contractAddress;
  }
  if (Array.isArray(tx.additionalContracts)) {
    for (const add of tx.additionalContracts) {
      if (add.contractName && (add.address || add.contractAddress)) {
        deployments.contracts[add.contractName] = add.address || add.contractAddress;
      }
    }
  }
}

// Fallback / verification check for known names
const expectedNames = [
  'MockStock',
  'MockUSDC',
  'MockDividendSource',
  'PrismVault',
  'PrincipalToken',
  'EpochCoupon',
  'PrismAuction'
];

for (const name of expectedNames) {
  if (!deployments.contracts[name]) {
    console.warn(`Warning: Expected contract ${name} not found directly in broadcast summary.`);
  }
}

const deploymentsJsonPath = path.join(chainDir, 'deployments.local.json');
fs.writeFileSync(deploymentsJsonPath, JSON.stringify(deployments, null, 2), 'utf8');
console.log(`Saved deployments to ${deploymentsJsonPath}`);

// 2. Extract ABIs from out/
const contractsToExtract = [
  { name: 'PrismVault', file: 'PrismVault.sol/PrismVault.json' },
  { name: 'PrismAuction', file: 'PrismAuction.sol/PrismAuction.json' },
  { name: 'PrincipalToken', file: 'PrincipalToken.sol/PrincipalToken.json' },
  { name: 'EpochCoupon', file: 'EpochCoupon.sol/EpochCoupon.json' },
  { name: 'MockStock', file: 'MockStock.sol/MockStock.json' },
  { name: 'MockUSDC', file: 'MockUSDC.sol/MockUSDC.json' },
  { name: 'MockDividendSource', file: 'MockDividendSource.sol/MockDividendSource.json' }
];

for (const item of contractsToExtract) {
  const artifactPath = path.join(outDir, item.file);
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const destAbiPath = path.join(abiDir, `${item.name}.json`);
    fs.writeFileSync(destAbiPath, JSON.stringify(artifact.abi, null, 2), 'utf8');
    console.log(`Saved ABI for ${item.name} to ${destAbiPath}`);
  } else {
    console.error(`Artifact not found at ${artifactPath}`);
  }
}

console.log('Artifact extraction complete.');
