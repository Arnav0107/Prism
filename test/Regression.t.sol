// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";

/**
 * @title RegressionTest
 * @notice Inverted PoC regression tests asserting hardened protocol behavior.
 *         Mapping: A->H1, B->H2, C->H3, D->H4, E->H5, F->M1, G->M2, plus M3 and M4.
 */
contract RegressionTest is Test, IERC1155Receiver {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    PrincipalToken internal principal;
    EpochCoupon internal coupon;

    address internal admin = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal funder = makeAddr("funder");

    uint256 internal constant T0 = 1_000_000;

    function setUp() public virtual {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        // Default vault for regression tests initialized with demoMode = true
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        stock.mint(alice, 10_000e18);
        stock.mint(bob, 10_000e18);
        usdc.mint(funder, 1_000_000e6);

        vm.prank(alice);
        stock.approve(address(vault), type(uint256).max);

        vm.prank(bob);
        stock.approve(address(vault), type(uint256).max);

        vm.prank(funder);
        usdc.approve(address(vault), type(uint256).max);
    }

    // --- IERC1155Receiver implementation ---
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    // =========================================================================
    // Regression A -> H1: createEpoch must not break 1 PPT = 1 EC per live epoch
    // =========================================================================
    function test_regression_A_H1() public {
        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        vault.createEpoch(T0 + 60 days, T0 + 65 days);

        assertFalse(vault.isSealed(), "Vault should not be sealed initially");

        // Deposit 100 stock
        vm.prank(alice);
        vault.deposit(100e18);

        // After first deposit, vault is sealed
        assertTrue(vault.isSealed(), "Vault should be sealed after first deposit");

        // Attempting to createEpoch post-deposit must revert with EpochsSealed
        vm.expectRevert(PrismVault.EpochsSealed.selector);
        vault.createEpoch(T0 + 90 days, T0 + 95 days);

        // Deposit followed by recombine always succeeds before exDate
        uint256 stockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.recombine(100e18);
        assertEq(stock.balanceOf(alice) - stockBefore, 100e18, "Recombine restored full collateral");
        assertEq(principal.balanceOf(alice), 0);

        // Owner can also seal explicitly before any deposit
        PrismVault freshVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);
        freshVault.createEpoch(T0 + 30 days, T0 + 35 days);
        assertFalse(freshVault.isSealed());
        freshVault.seal();
        assertTrue(freshVault.isSealed());
        vm.expectRevert(PrismVault.EpochsSealed.selector);
        freshVault.createEpoch(T0 + 60 days, T0 + 65 days);
    }

    // =========================================================================
    // Regression B -> H2: Owner cannot lock principal (MAX_EPOCHS & MAX_EPOCH_HORIZON)
    // =========================================================================
    function test_regression_B_H2() public {
        PrismVault boundedVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);

        // Cannot create epoch beyond MAX_EPOCH_HORIZON (400 days)
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismVault.EpochHorizonExceeded.selector,
                T0 + 401 days,
                T0 + 400 days
            )
        );
        boundedVault.createEpoch(T0 + 401 days, T0 + 405 days);

        // Fill up to MAX_EPOCHS (16)
        for (uint256 i = 1; i <= 16; ++i) {
            boundedVault.createEpoch(T0 + (i * 20 days), T0 + (i * 20 days) + 5 days);
        }
        assertEq(boundedVault.epochCount(), 16);

        // 17th epoch creation reverts with MaxEpochsReached
        vm.expectRevert(PrismVault.MaxEpochsReached.selector);
        boundedVault.createEpoch(T0 + 350 days, T0 + 355 days);

        // Gas assertion: deposit with MAX_EPOCHS stays well under 1.5M gas
        vm.startPrank(alice);
        stock.approve(address(boundedVault), type(uint256).max);
        uint256 gasBefore = gasleft();
        boundedVault.deposit(100e18);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        assertLt(gasUsed, 1_500_000, "Deposit with 16 epochs must consume < 1.5M gas");
    }

    // =========================================================================
    // Regression E -> H5: demoMode constructor initialized & one-way toggle
    // =========================================================================
    function test_regression_E_H5() public {
        // Vault initialized with demoMode = false (production path)
        PrismVault prodVault = new PrismVault(address(stock), address(usdc), address(dividendSource), false);
        assertFalse(prodVault.demoMode(), "demoMode must initialize false when specified");

        prodVault.createEpoch(T0 + 30 days, T0 + 35 days);
        vm.prank(alice);
        stock.approve(address(prodVault), 100e18);
        vm.prank(alice);
        prodVault.deposit(100e18);

        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);

        // Funding before exDate reverts in production
        vm.prank(funder);
        usdc.approve(address(prodVault), type(uint256).max);
        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismVault.ExDateNotReached.selector,
                1,
                T0 + 30 days,
                T0
            )
        );
        prodVault.fundEpoch(1);

        // Owner cannot re-enable demoMode
        vm.expectRevert(PrismVault.CannotEnableDemoMode.selector);
        prodVault.setDemoMode(true);

        // Vault initialized with demoMode = true (testnet path) can disable it, but never re-enable
        PrismVault testVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);
        assertTrue(testVault.demoMode());
        testVault.setDemoMode(false);
        assertFalse(testVault.demoMode());

        vm.expectRevert(PrismVault.CannotEnableDemoMode.selector);
        testVault.setDemoMode(true);
    }

    // =========================================================================
    // Regression M4: Unit naming clarity (usdcPerShare)
    // =========================================================================
    function test_regression_M4() public {
        vault.createEpoch(T0 + 30 days, T0 + 35 days);

        vm.prank(alice);
        vault.deposit(100e18);

        // usdcPerShare = 1.5e6 ($1.50 USDC per 1e18 share)
        uint256 usdcPerShare = 1.5e6;
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, usdcPerShare);

        (bool declared, IDividendSource.ActionType actionType, uint256 declaredUsdcPerShare) =
            dividendSource.getEvent(1);
        assertTrue(declared);
        assertEq(uint256(actionType), uint256(IDividendSource.ActionType.DIVIDEND));
        assertEq(declaredUsdcPerShare, 1.5e6);

        // 100e18 coupons with 1.5e6 USDC per share requires 150e6 USDC payout
        uint256 expectedPayout = 150e6;
        vm.prank(funder);
        vault.fundEpoch(1);

        PrismVault.EpochInfo memory epochInfo = vault.getEpoch(1);
        assertEq(epochInfo.totalFundedUSDC, expectedPayout, "Payout must be exactly 150 USDC (150e6)");

        // Alice claims full 100e18 coupons
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.claim(1, 100e18);
        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, expectedPayout, "Alice receives 150 USDC");
    }
}
