// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {MockRebasingStock} from "../contracts/MockRebasingStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";

contract InKindDividendsTest is Test {
    MockRebasingStock public rebasingStock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;
    PrismVault public vault;
    PrincipalToken public principal;
    EpochCoupon public coupon;

    address public owner = address(0xAA);
    address public alice = address(0x11);
    address public bob = address(0x22);

    uint256 public constant T0 = 1_000_000;

    function setUp() public {
        vm.warp(T0);

        rebasingStock = new MockRebasingStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vm.startPrank(owner);
        // demoMode = true, inKindDividends = true
        vault = new PrismVault(address(rebasingStock), address(usdc), address(dividendSource), true, true);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        // Create 2 epochs
        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        vault.createEpoch(T0 + 60 days, T0 + 65 days);
        vm.stopPrank();

        // Fund users with initial stock
        rebasingStock.mint(alice, 1_000e18);
        rebasingStock.mint(bob, 1_000e18);

        vm.prank(alice);
        rebasingStock.approve(address(vault), type(uint256).max);

        vm.prank(bob);
        rebasingStock.approve(address(vault), type(uint256).max);
    }

    function test_inKind_depositAndMints() public {
        vm.prank(alice);
        vault.deposit(100e18);

        assertEq(principal.balanceOf(alice), 100e18, "Alice received 100 PT");
        assertEq(coupon.balanceOf(alice, 1), 100e18, "Alice received 100 EC for epoch 1");
        assertEq(coupon.balanceOf(alice, 2), 100e18, "Alice received 100 EC for epoch 2");

        // Backing invariant holds
        assertGe(
            rebasingStock.balanceOf(address(vault)),
            principal.totalSupply() + vault.totalUnclaimedInKindStock(),
            "Backing invariant holds"
        );
    }

    function test_inKind_rebaseDividendSweepAndClaim() public {
        vm.prank(alice);
        vault.deposit(1_000e18);

        assertEq(principal.balanceOf(alice), 1_000e18);

        // Rebase stock by +0.5% (multiplier = 10_050)
        rebasingStock.setMultiplierBps(10_050);

        // Vault balance should now be 1000 * 1.005 = 1005 tokens
        uint256 vaultBalAfterRebase = rebasingStock.balanceOf(address(vault));
        assertEq(vaultBalAfterRebase, 1_005e18, "Vault balance scaled to 1005");

        // Fund epoch 1: sweeps 5e18 surplus into epoch 1 pot with 0 USDC required
        uint256 usdcBefore = usdc.balanceOf(address(vault));
        vault.fundEpoch(1);
        uint256 usdcAfter = usdc.balanceOf(address(vault));
        assertEq(usdcBefore, usdcAfter, "Zero USDC pulled for in-kind funding");

        assertEq(vault.totalFundedStock(1), 5e18, "5e18 surplus recorded in pot");
        assertEq(vault.totalUnclaimedInKindStock(), 5e18, "Unclaimed in-kind stock updated");

        // Invariant holds
        assertGe(
            rebasingStock.balanceOf(address(vault)),
            principal.totalSupply() + vault.totalUnclaimedInKindStock(),
            "Backing invariant holds post-funding"
        );

        // Alice claims epoch 1 coupon
        uint256 aliceStockBefore = rebasingStock.balanceOf(alice);
        vm.prank(alice);
        vault.claim(1, 1_000e18);
        uint256 aliceStockAfter = rebasingStock.balanceOf(alice);

        assertApproxEqAbs(aliceStockAfter - aliceStockBefore, 5e18, 2, "Alice received ~5e18 rebase dividend in stock");
        assertEq(vault.totalUnclaimedInKindStock(), 0, "Unclaimed stock back to 0");
    }

    function test_inKind_principalRedemptionAtMaturityIsOneToOne() public {
        vm.prank(alice);
        vault.deposit(1_000e18);

        // Rebase stock by +1% (multiplier = 10_100)
        rebasingStock.setMultiplierBps(10_100);
        assertEq(rebasingStock.balanceOf(address(vault)), 1_010e18);

        // Fund both epochs, each gets swept if surplus exists
        vault.fundEpoch(1);
        assertEq(vault.totalFundedStock(1), 10e18, "Epoch 1 got full 10e18 surplus");

        // Alice claims dividend in stock
        vm.prank(alice);
        vault.claim(1, 1_000e18);
        assertEq(rebasingStock.balanceOf(address(vault)), 1_000e18, "Remaining in vault is exactly 1000 PT backing");

        // Warp past epoch 2 exDate + FUNDING_GRACE (30 days past 60 days = 90 days)
        vm.warp(T0 + 95 days);

        // Alice redeems principal 1:1
        uint256 aliceStockBefore = rebasingStock.balanceOf(alice);
        vm.prank(alice);
        vault.redeemPrincipal(1_000e18);
        uint256 aliceStockAfter = rebasingStock.balanceOf(alice);

        assertApproxEqAbs(aliceStockAfter - aliceStockBefore, 1_000e18, 2, "Principal token redeemed 1:1 for original principal");
        assertEq(principal.totalSupply(), 0, "All PT burned");
        assertLe(rebasingStock.balanceOf(address(vault)), 2, "Vault cleanly emptied (within rounding tolerance)");
    }

    function test_inKind_invariantHoldsUnderMultipleRebasesAndOperations() public {
        // Alice deposits 400
        vm.prank(alice);
        vault.deposit(400e18);

        // Bob deposits 600
        vm.prank(bob);
        vault.deposit(600e18);

        assertEq(principal.totalSupply(), 1_000e18);
        _assertInvariant();

        // 1st Rebase: +2% (10_200)
        rebasingStock.setMultiplierBps(10_200);
        _assertInvariant();

        // Fund epoch 1
        vault.fundEpoch(1);
        _assertInvariant();

        // Alice recombines 100 (she burns 100 PT and 100 live EC for epoch 2; epoch 1 is already funded)
        vm.prank(alice);
        vault.recombine(100e18);
        _assertInvariant();

        // Bob claims 300 of his 600 coupons for epoch 1
        vm.prank(bob);
        vault.claim(1, 300e18);
        _assertInvariant();

        // 2nd Rebase: +1% additional (10_300)
        rebasingStock.setMultiplierBps(10_300);
        _assertInvariant();

        // Fund epoch 2 with new surplus
        vault.fundEpoch(2);
        _assertInvariant();

        // Alice claims remaining coupons
        vm.prank(alice);
        vault.claim(1, 400e18);
        vm.prank(alice);
        vault.claim(2, 300e18);
        _assertInvariant();

        // Bob claims remaining coupons
        vm.prank(bob);
        vault.claim(1, 300e18);
        vm.prank(bob);
        vault.claim(2, 600e18);
        _assertInvariant();
    }

    function _assertInvariant() internal view {
        uint256 vaultBal = rebasingStock.balanceOf(address(vault));
        uint256 required = principal.totalSupply() + vault.totalUnclaimedInKindStock();
        assertGe(vaultBal, required, "Invariant violated: vault stock < PT supply + unclaimed in-kind stock");
    }
}
