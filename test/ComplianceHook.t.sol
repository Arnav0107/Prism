// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {MockAllowlistHook} from "../contracts/MockAllowlistHook.sol";

contract ComplianceHookTest is Test {
    PrismVault public vault;
    PrincipalToken public principal;
    EpochCoupon public coupon;
    MockStock public stock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;
    MockAllowlistHook public hook;

    address public owner = address(0xAA);
    address public alice = address(0x11);
    address public bob = address(0x22);
    address public charlie = address(0x33);

    uint256 public constant T0 = 1_000_000;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();

        vm.startPrank(owner);
        dividendSource = new MockDividendSource();
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        vault.seal();

        hook = new MockAllowlistHook();
        vault.setComplianceHook(address(hook));
        vm.stopPrank();

        stock.mint(alice, 10_000e18);
        vm.prank(alice);
        stock.approve(address(vault), type(uint256).max);
    }

    function test_compliance_mintAndBurnUnaffectedByHook() public {
        // Neither Alice nor vault is allowlisted yet.
        // Deposit (mint) must succeed completely without reverting.
        vm.prank(alice);
        vault.deposit(100e18);

        assertEq(principal.balanceOf(alice), 100e18, "Alice received 100 PT");
        assertEq(coupon.balanceOf(alice, 1), 100e18, "Alice received 100 EC");

        // Recombine (burn) must also succeed completely without reverting.
        vm.prank(alice);
        vault.recombine(50e18);

        assertEq(principal.balanceOf(alice), 50e18, "Recombine burned PT and EC cleanly");
    }

    function test_compliance_nonAllowlistedTransferReverts() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Neither Alice nor Charlie is allowlisted
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrincipalToken.ComplianceCheckFailed.selector, alice, charlie));
        principal.transfer(charlie, 10e18);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EpochCoupon.ComplianceCheckFailed.selector, alice, charlie));
        coupon.safeTransferFrom(alice, charlie, 1, 10e18, "");
    }

    function test_compliance_allowlistedTransferSucceeds() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Allowlist Alice and Bob
        vm.startPrank(owner);
        hook.setAllowed(alice, true);
        hook.setAllowed(bob, true);
        vm.stopPrank();

        // Alice transfers PT to Bob
        vm.prank(alice);
        principal.transfer(bob, 25e18);
        assertEq(principal.balanceOf(bob), 25e18, "Bob received 25 PT");

        // Alice transfers EC to Bob
        vm.prank(alice);
        coupon.safeTransferFrom(alice, bob, 1, 25e18, "");
        assertEq(coupon.balanceOf(bob, 1), 25e18, "Bob received 25 EC");

        // Transfer to non-allowlisted Charlie still reverts
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrincipalToken.ComplianceCheckFailed.selector, bob, charlie));
        principal.transfer(charlie, 5e18);
    }

    function test_compliance_disablingHookResumesUnrestrictedTransfers() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Disable compliance hook (set to address(0))
        vm.prank(owner);
        vault.setComplianceHook(address(0));

        // Transfer to Charlie succeeds without allowlist
        vm.prank(alice);
        principal.transfer(charlie, 30e18);
        assertEq(principal.balanceOf(charlie), 30e18, "Charlie received 30 PT with hook disabled");

        vm.prank(alice);
        coupon.safeTransferFrom(alice, charlie, 1, 30e18, "");
        assertEq(coupon.balanceOf(charlie, 1), 30e18, "Charlie received 30 EC with hook disabled");
    }
}
