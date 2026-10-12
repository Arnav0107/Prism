import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getContract,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const deploymentsPath = path.join(projectRoot, 'web/src/chain/deployments.local.json');
if (!fs.existsSync(deploymentsPath)) {
  console.error('Deployments file not found! Please run bash script/DeployLocal.sh first.');
  process.exit(1);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
const { contracts } = deployments;

const readAbi = (name) => {
  const p = path.join(projectRoot, `web/src/chain/abi/${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const PrismVaultAbi = readAbi('PrismVault');
const PrismAuctionAbi = readAbi('PrismAuction');
const MockStockAbi = readAbi('MockStock');
const MockUSDCAbi = readAbi('MockUSDC');
const MockDividendSourceAbi = readAbi('MockDividendSource');
const PrincipalTokenAbi = readAbi('PrincipalToken');
const EpochCouponAbi = readAbi('EpochCoupon');

const RPC_URL = 'http://127.0.0.1:8545';

const anvilChain = defineChain({
  id: 31337,
  name: 'Anvil Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({
  chain: anvilChain,
  transport: http(RPC_URL),
});

// Accounts
const deployerAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const aliceAccount = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const bobAccount = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

const deployerClient = createWalletClient({ account: deployerAccount, chain: anvilChain, transport: http(RPC_URL) });
const aliceClient = createWalletClient({ account: aliceAccount, chain: anvilChain, transport: http(RPC_URL) });
const bobClient = createWalletClient({ account: bobAccount, chain: anvilChain, transport: http(RPC_URL) });

const stockContract = getContract({ address: contracts.MockStock, abi: MockStockAbi, client: publicClient });
const usdcContract = getContract({ address: contracts.MockUSDC, abi: MockUSDCAbi, client: publicClient });
const ptContract = getContract({ address: contracts.PrincipalToken, abi: PrincipalTokenAbi, client: publicClient });
const ecContract = getContract({ address: contracts.EpochCoupon, abi: EpochCouponAbi, client: publicClient });
const vaultContract = getContract({ address: contracts.PrismVault, abi: PrismVaultAbi, client: publicClient });
const auctionContract = getContract({ address: contracts.PrismAuction, abi: PrismAuctionAbi, client: publicClient });
const dividendContract = getContract({ address: contracts.MockDividendSource, abi: MockDividendSourceAbi, client: publicClient });

const results = [];

function recordResult(step, description, passed, detail) {
  results.push({ step, description, status: passed ? 'PASS' : 'FAIL', detail });
  const mark = passed ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`${mark} Step ${step}: ${description} (${detail})`);
  if (!passed) {
    console.error(`FAILURE in Step ${step}: ${detail}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('PRISM LOCAL INTEGRATION TEST & TRADE EVIDENCE RUNNER (ANVIL 31337)');
  console.log('================================================================');
  console.log(`PrismVault:    ${contracts.PrismVault}`);
  console.log(`PrismAuction:  ${contracts.PrismAuction}`);
  console.log(`Deployer:      ${deployerAccount.address}`);
  console.log(`Alice:         ${aliceAccount.address}`);
  console.log(`Bob:           ${bobAccount.address}`);
  console.log('----------------------------------------------------------------\n');

  // STEP 0: Seed test balances
  try {
    const mintAmt = parseUnits('1000', 18);
    const mintUsdc = parseUnits('10000', 6);

    const h1 = await deployerClient.writeContract({
      address: contracts.MockStock,
      abi: MockStockAbi,
      functionName: 'mint',
      args: [aliceAccount.address, mintAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    const h2 = await deployerClient.writeContract({
      address: contracts.MockUSDC,
      abi: MockUSDCAbi,
      functionName: 'mint',
      args: [bobAccount.address, mintUsdc],
    });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    const h3 = await deployerClient.writeContract({
      address: contracts.MockUSDC,
      abi: MockUSDCAbi,
      functionName: 'mint',
      args: [deployerAccount.address, mintUsdc],
    });
    await publicClient.waitForTransactionReceipt({ hash: h3 });

    recordResult('0', 'Seed initial test balances to Alice and Bob', true, '1,000 mSTOCK and 10,000 mUSDC minted');
  } catch (err) {
    recordResult('0', 'Seed initial test balances to Alice and Bob', false, String(err.message || err));
    process.exit(1);
  }

  // STEP 1: Alice deposits 100 mSTOCK into PrismVault
  try {
    const depositAmt = parseUnits('100', 18);
    const appHash = await aliceClient.writeContract({
      address: contracts.MockStock,
      abi: MockStockAbi,
      functionName: 'approve',
      args: [contracts.PrismVault, depositAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: appHash });

    const depHash = await aliceClient.writeContract({
      address: contracts.PrismVault,
      abi: PrismVaultAbi,
      functionName: 'deposit',
      args: [depositAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: depHash });

    const alicePT = await ptContract.read.balanceOf([aliceAccount.address]);
    const aliceEC1 = await ecContract.read.balanceOf([aliceAccount.address, 1n]);
    const aliceEC4 = await ecContract.read.balanceOf([aliceAccount.address, 4n]);

    const passed = alicePT >= depositAmt && aliceEC1 >= depositAmt && aliceEC4 >= depositAmt;
    recordResult(
      '1',
      'Alice deposits 100 mSTOCK to bifurcate into PT & EC(1..4)',
      passed,
      `Alice holds ${formatUnits(alicePT, 18)} PT and ${formatUnits(aliceEC1, 18)} EC(1)`
    );
  } catch (err) {
    recordResult('1', 'Alice deposits 100 mSTOCK to bifurcate into PT & EC(1..4)', false, String(err.message || err));
  }

  // STEP 2: Alice creates a Dutch auction for 50 Epoch 1 coupons
  let auctionId = 1n;
  try {
    const sellAmt = parseUnits('50', 18);
    const startPrice = parseUnits('1.50', 6);
    const floorPrice = parseUnits('0.50', 6);
    const duration = 3600n; // 1 hour

    const appCouponHash = await aliceClient.writeContract({
      address: contracts.EpochCoupon,
      abi: EpochCouponAbi,
      functionName: 'setApprovalForAll',
      args: [contracts.PrismAuction, true],
    });
    await publicClient.waitForTransactionReceipt({ hash: appCouponHash });

    const createHash = await aliceClient.writeContract({
      address: contracts.PrismAuction,
      abi: PrismAuctionAbi,
      functionName: 'createAuction',
      args: [1n, sellAmt, startPrice, floorPrice, duration],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

    const createdLogs = await publicClient.getLogs({
      address: contracts.PrismAuction,
      event: {
        type: 'event',
        name: 'AuctionCreated',
        inputs: [
          { name: 'auctionId', type: 'uint256', indexed: true },
          { name: 'seller', type: 'address', indexed: true },
          { name: 'epochId', type: 'uint256', indexed: true },
          { name: 'amount', type: 'uint256', indexed: false },
          { name: 'startPrice', type: 'uint256', indexed: false },
          { name: 'floorPrice', type: 'uint256', indexed: false },
          { name: 'duration', type: 'uint256', indexed: false },
          { name: 'startTime', type: 'uint256', indexed: false },
        ],
      },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    auctionId = createdLogs[0].args.auctionId;

    const auctionData = await auctionContract.read.getAuction([auctionId]);
    const remAmt = auctionData.amount ?? auctionData[2];
    const isActive = auctionData.active ?? auctionData[8];
    const passed = isActive === true && remAmt === sellAmt;

    recordResult(
      '2',
      'Alice creates Dutch Auction for 50 Epoch 1 coupons',
      passed,
      `Auction #${auctionId} active with ${formatUnits(remAmt, 18)} EC remaining`
    );
  } catch (err) {
    recordResult('2', 'Alice creates Dutch Auction for 50 Epoch 1 coupons', false, String(err.message || err));
  }

  // STEP 3: Bob and Deployer execute partial buys on Auction
  try {
    const bobBuyAmt = parseUnits('20', 18);
    const maxPrice = parseUnits('1.60', 6);

    // Bob approves USDC
    const bobAppHash = await bobClient.writeContract({
      address: contracts.MockUSDC,
      abi: MockUSDCAbi,
      functionName: 'approve',
      args: [contracts.PrismAuction, parseUnits('1000', 6)],
    });
    await publicClient.waitForTransactionReceipt({ hash: bobAppHash });

    // Bob buys 20 coupons
    const bobBuyHash = await bobClient.writeContract({
      address: contracts.PrismAuction,
      abi: PrismAuctionAbi,
      functionName: 'buy',
      args: [auctionId, bobBuyAmt, maxPrice],
    });
    await publicClient.waitForTransactionReceipt({ hash: bobBuyHash });

    const bobEC1 = await ecContract.read.balanceOf([bobAccount.address, 1n]);

    // Deployer buys 10 coupons
    const depAppHash = await deployerClient.writeContract({
      address: contracts.MockUSDC,
      abi: MockUSDCAbi,
      functionName: 'approve',
      args: [contracts.PrismAuction, parseUnits('1000', 6)],
    });
    await publicClient.waitForTransactionReceipt({ hash: depAppHash });

    const depBuyHash = await deployerClient.writeContract({
      address: contracts.PrismAuction,
      abi: PrismAuctionAbi,
      functionName: 'buy',
      args: [auctionId, parseUnits('10', 18), maxPrice],
    });
    await publicClient.waitForTransactionReceipt({ hash: depBuyHash });

    const auctionDataAfter = await auctionContract.read.getAuction([auctionId]);
    const remaining = auctionDataAfter.amount ?? auctionDataAfter[2];

    const passed = bobEC1 === bobBuyAmt && remaining === parseUnits('20', 18);
    recordResult(
      '3',
      'Bob and Deployer buy 20 and 10 coupons (two distinct accounts)',
      passed,
      `Bob received 20 EC(1). Remaining auction inventory: ${formatUnits(remaining, 18)} EC`
    );
  } catch (err) {
    recordResult('3', 'Bob and Deployer buy coupons', false, String(err.message || err));
  }

  // STEP 4: Declare dividend and Fund Epoch 1
  try {
    const dividendRate = parseUnits('1.25', 6); // $1.25 per share

    const decHash = await deployerClient.writeContract({
      address: contracts.MockDividendSource,
      abi: MockDividendSourceAbi,
      functionName: 'declareEvent',
      args: [1n, 0, dividendRate],
    });
    await publicClient.waitForTransactionReceipt({ hash: decHash });

    // Deployer approves USDC for vault funding
    const fundAppHash = await deployerClient.writeContract({
      address: contracts.MockUSDC,
      abi: MockUSDCAbi,
      functionName: 'approve',
      args: [contracts.PrismVault, parseUnits('1000', 6)],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundAppHash });

    const fundHash = await deployerClient.writeContract({
      address: contracts.PrismVault,
      abi: PrismVaultAbi,
      functionName: 'fundEpoch',
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });

    const epochInfo = await vaultContract.read.getEpoch([1n]);
    const isFunded = epochInfo?.funded ?? epochInfo?.[2];
    const fundedUSDC = epochInfo?.totalFundedUSDC ?? epochInfo?.[3] ?? 0n;

    const passed = isFunded === true && fundedUSDC > 0n;
    recordResult(
      '4',
      'Dividend declared and Epoch 1 funded with USDC',
      passed,
      `Epoch 1 funded = ${isFunded}, Total funded USDC = $${formatUnits(fundedUSDC, 6)}`
    );
  } catch (err) {
    recordResult('4', 'Dividend declared and Epoch 1 funded with USDC', false, String(err.message || err));
  }

  // STEP 5: Bob claims pro-rata dividend USDC by burning coupons
  try {
    const bobEC1Before = await ecContract.read.balanceOf([bobAccount.address, 1n]);
    const bobUsdcBefore = await usdcContract.read.balanceOf([bobAccount.address]);

    const claimHash = await bobClient.writeContract({
      address: contracts.PrismVault,
      abi: PrismVaultAbi,
      functionName: 'claim',
      args: [1n, bobEC1Before],
    });
    await publicClient.waitForTransactionReceipt({ hash: claimHash });

    const bobEC1After = await ecContract.read.balanceOf([bobAccount.address, 1n]);
    const bobUsdcAfter = await usdcContract.read.balanceOf([bobAccount.address]);

    const usdcReceived = bobUsdcAfter - bobUsdcBefore;
    // Expected: 20 * 1.25 = 25 USDC = 25,000,000 base units
    const expectedPayout = parseUnits('25', 6);

    const passed = bobEC1After === 0n && usdcReceived === expectedPayout;
    recordResult(
      '5',
      'Bob claims dividend USDC by burning his 20 Epoch 1 coupons',
      passed,
      `Burned 20 EC(1) and received exactly $${formatUnits(usdcReceived, 6)} USDC (expected $25.00)`
    );
  } catch (err) {
    recordResult('5', 'Bob claims dividend USDC', false, String(err.message || err));
  }

  // STEP 6: Alice recombines 40 PT + 40 live coupons (Epochs 2..4)
  // Epoch 1 is already funded and therefore not required for recombination!
  try {
    const recombineAmt = parseUnits('40', 18);
    const aliceStockBefore = await stockContract.read.balanceOf([aliceAccount.address]);
    const alicePTBefore = await ptContract.read.balanceOf([aliceAccount.address]);

    const recHash = await aliceClient.writeContract({
      address: contracts.PrismVault,
      abi: PrismVaultAbi,
      functionName: 'recombine',
      args: [recombineAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: recHash });

    const aliceStockAfter = await stockContract.read.balanceOf([aliceAccount.address]);
    const alicePTAfter = await ptContract.read.balanceOf([aliceAccount.address]);

    const stockRecovered = aliceStockAfter - aliceStockBefore;
    const ptBurned = alicePTBefore - alicePTAfter;

    const passed = stockRecovered === recombineAmt && ptBurned === recombineAmt;
    recordResult(
      '6',
      'Alice recombines 40 PT with remaining live coupons (Epoch 1 funded & excluded)',
      passed,
      `Burned 40 PT and retrieved exactly ${formatUnits(stockRecovered, 18)} mSTOCK shares`
    );
  } catch (err) {
    recordResult('6', 'Alice recombines 40 PT', false, String(err.message || err));
  }

  // PRINT SUMMARY TABLE
  console.log('\n================================================================');
  console.log('                 FINAL TEST-TRADE EVIDENCE TABLE                ');
  console.log('================================================================');
  console.log('| Step | Status | Action Description                            | Evidence / Result Details');
  console.log('|------|--------|-----------------------------------------------|-----------------------------------------');
  for (const r of results) {
    const padStep = r.step.padEnd(4);
    const padStatus = r.status.padEnd(6);
    const padDesc = (r.description.length > 45 ? r.description.slice(0, 42) + '...' : r.description).padEnd(45);
    console.log(`| ${padStep} | ${padStatus} | ${padDesc} | ${r.detail}`);
  }
  console.log('================================================================\n');

  const allPassed = results.every((r) => r.status === 'PASS');
  if (allPassed) {
    console.log('>> ALL 6 STEPS PASSED SUCCESSFULLY. PROTOCOL MECHANICS VERIFIED ON LOCAL ANVIL <<');
    process.exit(0);
  } else {
    console.error('>> SOME STEPS FAILED. CHECK LOGS ABOVE <<');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
