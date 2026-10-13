// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";

contract WithholdingTaxTest is Test {
    MockStock public stock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;
    PrismVault public vault;
    PrincipalToken public principal;
    EpochCoupon public coupon;

    address public alice = makeAddr("alice");
    address public funder = makeAddr("funder");

    function setUp() public {
        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        // demoMode = true for instant funding
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        // Add 3 quarterly distribution epochs
        vault.createEpoch(block.timestamp + 30 days, block.timestamp + 40 days);
        vault.createEpoch(block.timestamp + 60 days, block.timestamp + 70 days);
        vault.createEpoch(block.timestamp + 90 days, block.timestamp + 100 days);

        // Fund alice with stock and deposit
        stock.mint(alice, 100e18);
        vm.startPrank(alice);
        stock.approve(address(vault), 100e18);
        vault.deposit(100e18);
        vm.stopPrank();

        usdc.mint(funder, 1_000_000e6);
        vm.prank(funder);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_withholding_zeroPercent() public {
        // Gross $2.00 (2_000_000), withholding 0% -> Net $2.00
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2_000_000, 0);
        dividendSource.lockEvent(1);

        uint256 balanceBefore = usdc.balanceOf(address(vault));
        vm.prank(funder);
        vault.fundEpoch(1);

        PrismVault.EpochInfo memory ep = vault.getEpoch(1);
        // 100 coupons * $2.00 = 200 USDC (200_000_000)
        assertEq(ep.totalFundedUSDC, 200_000_000);
        assertEq(ep.fundedSupply, 100e18);
        assertEq(usdc.balanceOf(address(vault)) - balanceBefore, 200_000_000);

        // Alice claims 100 coupons -> receives full 200 USDC
        vm.prank(alice);
        vault.claim(1, 100e18);
        assertEq(usdc.balanceOf(alice), 200_000_000);
    }

    function test_withholding_thirtyPercent_xStocksStyle() public {
        // Gross $2.00 (2_000_000), withholding 30% (3000 bps) -> Net $1.40 (1_400_000)
        dividendSource.declareEvent(2, IDividendSource.ActionType.DIVIDEND, 2_000_000, 3000);
        dividendSource.lockEvent(2);

        uint256 balanceBefore = usdc.balanceOf(address(vault));
        vm.prank(funder);
        vault.fundEpoch(2);

        PrismVault.EpochInfo memory ep = vault.getEpoch(2);
        // 100 coupons * $1.40 = 140 USDC (140_000_000)
        assertEq(ep.totalFundedUSDC, 140_000_000);
        assertEq(ep.fundedSupply, 100e18);
        assertEq(usdc.balanceOf(address(vault)) - balanceBefore, 140_000_000);

        // Alice claims 50 coupons -> receives 70 USDC
        vm.prank(alice);
        vault.claim(2, 50e18);
        assertEq(usdc.balanceOf(alice), 70_000_000);
    }

    function test_withholding_oneHundredPercent() public {
        // Gross $2.00 (2_000_000), withholding 100% (10000 bps) -> Net $0.00
        dividendSource.declareEvent(3, IDividendSource.ActionType.DIVIDEND, 2_000_000, 10000);
        dividendSource.lockEvent(3);

        uint256 balanceBefore = usdc.balanceOf(address(vault));
        vm.prank(funder);
        vault.fundEpoch(3);

        PrismVault.EpochInfo memory ep = vault.getEpoch(3);
        assertEq(ep.totalFundedUSDC, 0);
        assertEq(ep.fundedSupply, 100e18);
        assertEq(usdc.balanceOf(address(vault)) - balanceBefore, 0);

        // Alice claims 100 coupons -> burns vouchers, receives 0 USDC safely
        vm.prank(alice);
        vault.claim(3, 100e18);
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(coupon.balanceOf(alice, 3), 0);
    }

    function test_withholding_revertsAboveTenThousandBps() public {
        vm.expectRevert(abi.encodeWithSelector(MockDividendSource.InvalidWithholdingBps.selector, 10001));
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2_000_000, 10001);
    }

    function test_getNetPayout_helper() public {
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 10_000_000, 2500); // 25% tax
        assertEq(dividendSource.getNetPayout(1), 7_500_000);
    }
}
