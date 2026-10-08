// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {PrismVault} from "../contracts/PrismVault.sol";

/**
 * @title DeployScript
 * @notice Deploys Prism contracts, initializes 4 quarterly epochs, and mints test balances.
 */
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey;
        try vm.envUint("PRIVATE_KEY") returns (uint256 key) {
            deployerPrivateKey = key;
        } catch {
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying Prism with deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy test tokens & mock dividend source
        MockStock stock = new MockStock();
        MockUSDC usdc = new MockUSDC();
        MockDividendSource dividendSource = new MockDividendSource();

        console.log("MockStock deployed at:      ", address(stock));
        console.log("MockUSDC deployed at:       ", address(usdc));
        console.log("DividendSource deployed at: ", address(dividendSource));

        // 2. Deploy PrismVault (vault deploys PrincipalToken and EpochCoupon)
        PrismVault vault = new PrismVault(
            address(stock),
            address(usdc),
            address(dividendSource)
        );

        console.log("PrismVault deployed at:     ", address(vault));
        console.log("PrincipalToken deployed at: ", address(vault.principalToken()));
        console.log("EpochCoupon deployed at:    ", address(vault.epochCoupon()));

        // 3. Create 4 quarterly epochs
        for (uint256 i = 1; i <= 4; ++i) {
            uint256 exDate = block.timestamp + (i * 90 days);
            uint256 payDate = exDate + 5 days;
            vault.createEpoch(exDate, payDate);
            console.log("Created Epoch", i);
        }

        // 4. Mint test balances for deployer
        stock.mint(deployer, 1_000_000e18);
        usdc.mint(deployer, 1_000_000e6);

        console.log("Minted 1,000,000 mSTOCK and 1,000,000 mUSDC to deployer");

        vm.stopBroadcast();
        console.log("Deployment completed successfully.");
    }
}
