// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {MockReferencePrice} from "../contracts/MockReferencePrice.sol";

/**
 * @title DeployScript
 * @notice Deploys Prism contracts on Monad testnet or local Anvil, initializes and seals 4 quarterly epochs,
 *         declares and locks corporate action dividends, approves auction escrow, mints test funds,
 *         and serializes contract addresses to appropriate deployment file.
 */
contract DeployScript is Script {
    function run() external {
        if (block.chainid != 31337 && block.chainid != 10143) {
            revert("Unsupported chain id: only 31337 (Anvil) and 10143 (Monad Testnet) supported");
        }

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying Prism with deployer:", deployer);

        // Read DEMO_MODE: default true only for chain 31337, false otherwise
        bool demoMode = vm.envOr("DEMO_MODE", block.chainid == 31337);
        console.log("Deploying with demoMode:", demoMode);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy test tokens & mock dividend source
        MockStock stock = new MockStock();
        MockUSDC usdc = new MockUSDC();
        MockDividendSource dividendSource = new MockDividendSource();
        MockReferencePrice referencePrice = new MockReferencePrice(100_000_000); // $100.00 default stock price

        console.log("MockStock deployed at:          ", address(stock));
        console.log("MockUSDC deployed at:           ", address(usdc));
        console.log("DividendSource deployed at:     ", address(dividendSource));
        console.log("ReferencePrice deployed at:     ", address(referencePrice));

        // 2. Deploy PrismVault
        PrismVault vault = new PrismVault(address(stock), address(usdc), address(dividendSource), demoMode, false);

        address ptAddress = address(vault.principalToken());
        address ecAddress = address(vault.epochCoupon());

        console.log("PrismVault deployed at:         ", address(vault));
        console.log("PrincipalToken deployed at:     ", ptAddress);
        console.log("EpochCoupon deployed at:        ", ecAddress);

        // 3. Deploy PrismAuction
        PrismAuction auction = new PrismAuction(ecAddress, address(usdc), address(vault));
        console.log("PrismAuction deployed at:       ", address(auction));

        // 4. Create 4 quarterly epochs before any deposit
        for (uint256 i = 1; i <= 4; ++i) {
            uint256 exDate = block.timestamp + (i * 90 days);
            uint256 payDate = exDate + 5 days;
            vault.createEpoch(exDate, payDate);
            console.log("Created Epoch", i);
        }

        // 5. Seal epoch schedule permanently
        vault.seal();
        console.log("Epoch schedule permanently sealed via seal()");

        // 6. Declare and lock dividend corporate actions for demo epochs
        // Rate: 1.50 USDC (1_500_000 base units) per share
        for (uint256 i = 1; i <= 4; ++i) {
            dividendSource.declareEvent(i, IDividendSource.ActionType.DIVIDEND, 1_500_000);
            dividendSource.lockEvent(i);
            console.log("Declared and locked dividend for Epoch", i);
        }

        // 7. Mint test balances for deployer
        stock.mint(deployer, 1_000_000e18);
        usdc.mint(deployer, 1_000_000e6);
        console.log("Minted 1,000,000 mSTOCK and 1,000,000 mUSDC to deployer");

        // 8. Approvals for seamless trading & auction operations
        EpochCoupon(ecAddress).setApprovalForAll(address(auction), true);
        usdc.approve(address(auction), type(uint256).max);
        stock.approve(address(vault), type(uint256).max);
        console.log("Approved PrismAuction for EpochCoupon and MockUSDC");

        // 9. Governance: transfer ownership if OWNER env var is set
        address targetOwner = vm.envOr("OWNER", address(0));
        if (targetOwner != address(0) && targetOwner != deployer) {
            vault.transferOwnership(targetOwner);
            dividendSource.transferOwnership(targetOwner);
            console.log("Initiated 2-step ownership transfer to:", targetOwner);
        }

        vm.stopBroadcast();

        // 10. Serialize and write deployment addresses
        string memory contractsObj = "contracts";
        vm.serializeAddress(contractsObj, "MockStock", address(stock));
        vm.serializeAddress(contractsObj, "MockUSDC", address(usdc));
        vm.serializeAddress(contractsObj, "MockDividendSource", address(dividendSource));
        vm.serializeAddress(contractsObj, "PrismVault", address(vault));
        vm.serializeAddress(contractsObj, "PrincipalToken", ptAddress);
        vm.serializeAddress(contractsObj, "EpochCoupon", ecAddress);
        vm.serializeAddress(contractsObj, "MockReferencePrice", address(referencePrice));
        string memory contractsJson = vm.serializeAddress(contractsObj, "PrismAuction", address(auction));

        string memory rootObj = "root";
        vm.serializeUint(rootObj, "chainId", block.chainid);
        string memory finalJson = vm.serializeJson(rootObj, contractsJson);

        if (block.chainid == 31337) {
            vm.writeJson(finalJson, "./web/src/chain/deployments.local.json");
            console.log("Serialized deployments to web/src/chain/deployments.local.json");
        } else if (block.chainid == 10143) {
            vm.writeJson(finalJson, "./deployments/monad-testnet.json");
            console.log("Serialized deployments to deployments/monad-testnet.json");
        } else {
            revert("Unsupported chain id for deployment artifact writing");
        }
        console.log("Deployment completed successfully.");
    }
}
