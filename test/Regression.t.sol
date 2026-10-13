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
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
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
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
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
        PrismVault freshVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
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
        PrismVault boundedVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);

        // Cannot create epoch beyond MAX_EPOCH_HORIZON (400 days)
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochHorizonExceeded.selector, T0 + 401 days, T0 + 400 days));
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
        PrismVault prodVault = new PrismVault(address(stock), address(usdc), address(dividendSource), false, false);
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
        vm.expectRevert(abi.encodeWithSelector(PrismVault.ExDateNotReached.selector, 1, T0 + 30 days, T0));
        prodVault.fundEpoch(1);

        // Owner cannot re-enable demoMode
        vm.expectRevert(PrismVault.CannotEnableDemoMode.selector);
        prodVault.setDemoMode(true);

        // Vault initialized with demoMode = true (testnet path) can disable it, but never re-enable
        PrismVault testVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
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
        dividendSource.lockEvent(1);

        (bool declared, IDividendSource.ActionType actionType, uint256 declaredUsdcPerShare,, bool locked) =
            dividendSource.getEvent(1);
        assertTrue(declared);
        assertTrue(locked);
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

    // =========================================================================
    // Regression C -> H3: Funding incentives & 30-day grace period
    // =========================================================================
    function test_regression_C_H3() public {
        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        vault.createEpoch(T0 + 100 days, T0 + 105 days);

        vm.prank(alice);
        vault.deposit(100e18);

        // Warp past epoch 1 exDate but inside FUNDING_GRACE (30 days)
        vm.warp(T0 + 35 days);

        // Check fundingStatus view
        (bool live, bool awaitingFunding, bool defaulted, uint256 graceEndsAt) = vault.fundingStatus(1);
        assertFalse(live, "Epoch 1 is past exDate so not live");
        assertTrue(awaitingFunding, "Epoch 1 should be awaiting funding");
        assertFalse(defaulted, "Epoch 1 is not defaulted while within grace");
        assertEq(graceEndsAt, T0 + 60 days, "Grace period ends 30 days after exDate");

        // Alice attempts recombine while epoch 1 is unfunded -> blocked!
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochAwaitingFunding.selector, 1, T0 + 60 days));
        vault.recombine(100e18);

        // Attempting redeemPrincipal while awaiting funding or live epochs exist is also blocked
        vm.prank(alice);
        vm.expectRevert();
        vault.redeemPrincipal(100e18);

        // Permissionless funding: any funder declares, locks, and funds epoch 1
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2e6);
        dividendSource.lockEvent(1);
        vm.prank(funder);
        vault.fundEpoch(1);

        // After funding, awaitingFunding is false
        (, awaitingFunding,,) = vault.fundingStatus(1);
        assertFalse(awaitingFunding, "Epoch 1 is no longer awaiting funding");

        // Recombine now succeeds because epoch 1 is funded and skipped!
        uint256 stockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.recombine(100e18);
        assertEq(stock.balanceOf(alice) - stockBefore, 100e18, "Collateral returned to Alice");

        // Alice (or whoever holds coupon 1) gets paid in the funded path
        vm.prank(alice);
        vault.claim(1, 100e18);
        assertEq(usdc.balanceOf(alice), 200e6, "Coupon holder paid full dividend");

        // Test grace expiry path: fresh vault where grace period lapses without funding
        PrismVault graceVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        uint256 curTime = block.timestamp;
        graceVault.createEpoch(curTime + 10 days, curTime + 15 days);
        vm.prank(bob);
        stock.approve(address(graceVault), type(uint256).max);
        vm.prank(bob);
        graceVault.deposit(50e18);

        // Warp past exDate + 30 days grace period
        vm.warp(curTime + 41 days);
        (, bool graceAwaiting, bool graceDefaulted,) = graceVault.fundingStatus(1);
        assertFalse(graceAwaiting, "Grace period has elapsed");
        assertTrue(graceDefaulted, "Epoch 1 is defaulted after grace period without funding");

        // Principal redemption is now allowed after grace period expires
        uint256 bobStockBefore = stock.balanceOf(bob);
        vm.prank(bob);
        graceVault.redeemPrincipal(50e18);
        assertEq(stock.balanceOf(bob) - bobStockBefore, 50e18, "Bob redeemed principal after grace");
    }

    // =========================================================================
    // Regression D -> H4: Declaration correction and locking before funding
    // =========================================================================
    function test_regression_D_H4() public {
        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        vm.prank(alice);
        vault.deposit(100e18);

        // 1. Owner accidentally declares a SPLIT action
        dividendSource.declareEvent(1, IDividendSource.ActionType.SPLIT, 0);

        // Funding before event is locked reverts with EventNotLocked
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EventNotLocked.selector, 1));
        vault.fundEpoch(1);

        // 2. Owner corrects the declaration to DIVIDEND before locking (not bricked!)
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        (bool decl, IDividendSource.ActionType act, uint256 amt,, bool lck) = dividendSource.getEvent(1);
        assertTrue(decl);
        assertFalse(lck);
        assertEq(uint256(act), uint256(IDividendSource.ActionType.DIVIDEND));
        assertEq(amt, 1e6);

        // 3. Owner locks the event
        dividendSource.lockEvent(1);
        (,,,, lck) = dividendSource.getEvent(1);
        assertTrue(lck, "Event must be locked");

        // Locked declaration is immutable: attempting to re-declare or re-lock reverts
        vm.expectRevert(abi.encodeWithSelector(MockDividendSource.EventIsLocked.selector, 1));
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2e6);

        vm.expectRevert(abi.encodeWithSelector(MockDividendSource.EventIsLocked.selector, 1));
        dividendSource.lockEvent(1);

        // 4. Funding now succeeds
        vm.prank(funder);
        vault.fundEpoch(1);
        (,, bool funded,,) = vault.epochs(1);
        assertTrue(funded, "Epoch 1 successfully funded with corrected declaration");
    }

    // =========================================================================
    // Regression F -> M1: MIN_FILL enforcement & spoof-resistant VWAP
    // =========================================================================
    function test_regression_F_M1() public {
        vault.createEpoch(T0 + 30 days, T0 + 35 days);
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(1);
        vm.prank(alice);
        vault.deposit(100e18);

        PrismAuction auction = new PrismAuction(address(coupon), address(usdc), address(vault));
        vm.prank(alice);
        coupon.setApprovalForAll(address(auction), true);

        // Alice creates auction for 50e18 coupons
        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1000);

        // Buyer attempting to fill dust (< MIN_FILL = 1e15) while remainder is 50e18 reverts
        usdc.mint(bob, 10_000e6);
        vm.prank(bob);
        usdc.approve(address(auction), type(uint256).max);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.FillBelowMinimum.selector, 1e12, auction.MIN_FILL()));
        auction.buy(auctionId, 1e12, type(uint256).max);

        // Legitimate buy of 10e18 coupons at 2 USDC (2e6)
        vm.prank(bob);
        auction.buy(auctionId, 10e18, type(uint256).max);

        (uint256 vwap1, uint256 vol1,) = auction.getEpochMarketData(1);
        assertEq(vol1, 10e18);
        assertEq(vwap1, 2e6, "Initial VWAP equals purchase price");

        // Warp time so price decays to 1.5e6
        vm.warp(T0 + 500);

        // Second buyer buys 10e18 at 1.5e6
        address charlie = makeAddr("charlie");
        usdc.mint(charlie, 10_000e6);
        vm.prank(charlie);
        usdc.approve(address(auction), type(uint256).max);

        vm.prank(charlie);
        auction.buy(auctionId, 10e18, type(uint256).max);

        // Total volume = 20e18. Total notional = (10 * 2) + (10 * 1.5) = 35 USDC (35e6)
        // VWAP = 35e6 * 1e18 / 20e18 = 1.75e6
        (uint256 vwap2, uint256 vol2,) = auction.getEpochMarketData(1);
        assertEq(vol2, 20e18);
        assertEq(vwap2, 1_750_000, "VWAP must be volume weighted");

        // A small wash trade at MIN_FILL = 1e15 cannot move VWAP materially
        vm.prank(bob);
        auction.buy(auctionId, 1e15, type(uint256).max);
        (uint256 vwapAfterWash,,) = auction.getEpochMarketData(1);
        // VWAP change is negligible (< 0.01%)
        assertApproxEqAbs(vwapAfterWash, 1_750_000, 100, "Dust fill cannot move VWAP materially");
    }

    // =========================================================================
    // Regression G -> M2: Bounded loops and gas limits
    // =========================================================================
    function test_regression_G_M2() public {
        PrismVault maxVault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        for (uint256 i = 1; i <= 16; ++i) {
            maxVault.createEpoch(T0 + (i * 20 days), T0 + (i * 20 days) + 5 days);
        }

        // Test deposit gas bound
        vm.prank(alice);
        stock.approve(address(maxVault), 100e18);
        uint256 g0 = gasleft();
        vm.prank(alice);
        maxVault.deposit(100e18);
        uint256 depositGas = g0 - gasleft();
        assertLt(depositGas, 1_500_000, "Deposit with 16 epochs must stay under 1.5M gas");

        // Test recombine gas bound
        g0 = gasleft();
        vm.prank(alice);
        maxVault.recombine(50e18);
        uint256 recombineGas = g0 - gasleft();
        assertLt(recombineGas, 1_500_000, "Recombine with 16 epochs must stay under 1.5M gas");

        // Test hasFutureEpochs loop gas bound
        g0 = gasleft();
        bool hasFut = maxVault.hasFutureEpochs();
        uint256 viewGas = g0 - gasleft();
        assertTrue(hasFut);
        assertLt(viewGas, 100_000, "View loop must be minimal gas");
    }

    // =========================================================================
    // Regression M3: Fee-on-transfer / Unsupported collateral rejection
    // =========================================================================
    function test_regression_M3() public {
        MockFeeOnTransferStock feeStock = new MockFeeOnTransferStock();
        PrismVault fotVault = new PrismVault(address(feeStock), address(usdc), address(dividendSource), true, false);
        fotVault.createEpoch(block.timestamp + 30 days, block.timestamp + 35 days);

        feeStock.mint(address(this), 1_000e18);
        feeStock.approve(address(fotVault), type(uint256).max);

        // Attempting to deposit fee-on-transfer collateral must revert with UnsupportedCollateral()
        vm.expectRevert(PrismVault.UnsupportedCollateral.selector);
        fotVault.deposit(100e18);
    }

    // =========================================================================
    // Regression M5: Ownable2Step two-step ownership handover
    // =========================================================================
    function test_regression_M5() public {
        address newAdmin = makeAddr("newAdmin");

        // Transfer vault ownership: pending until accepted
        vault.transferOwnership(newAdmin);
        assertEq(vault.owner(), address(this), "Owner should not change immediately");
        assertEq(vault.pendingOwner(), newAdmin);

        vm.prank(newAdmin);
        vault.acceptOwnership();
        assertEq(vault.owner(), newAdmin, "New owner must be set after acceptOwnership");

        // Same two-step transfer for MockDividendSource
        dividendSource.transferOwnership(newAdmin);
        assertEq(dividendSource.owner(), address(this));
        vm.prank(newAdmin);
        dividendSource.acceptOwnership();
        assertEq(dividendSource.owner(), newAdmin);
    }
}

contract MockFeeOnTransferStock is MockStock {
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        // Take a 5% fee on transfer
        uint256 fee = (amount * 5) / 100;
        uint256 netAmount = amount - fee;
        return super.transferFrom(from, to, netAmount);
    }
}
