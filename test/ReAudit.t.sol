// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";

/**
 * @title ReAuditRegressionTest
 * @notice Inverted passing regression tests for audit findings R1-R6 and M3.
 */
contract ReAuditRegressionTest is Test, IERC1155Receiver {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    PrincipalToken internal principal;
    EpochCoupon internal coupon;
    PrismAuction internal auction;

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal epoch1Ex;
    uint256 internal epoch2Ex;

    event FundingDefaulted(uint256 indexed epochId);
    event GuardianTransferStarted(address indexed previousGuardian, address indexed newGuardian);
    event GuardianTransferred(address indexed previousGuardian, address indexed newGuardian);

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vm.startPrank(owner);
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        auction = new PrismAuction(address(coupon), address(usdc), address(vault));

        epoch1Ex = T0 + 30 days;
        epoch2Ex = T0 + 60 days;

        vault.createEpoch(epoch1Ex, epoch1Ex + 5 days);
        vault.createEpoch(epoch2Ex, epoch2Ex + 5 days);
        vm.stopPrank();

        stock.mint(alice, 10_000e18);
        stock.mint(bob, 10_000e18);
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);

        vm.prank(alice);
        stock.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        stock.approve(address(vault), type(uint256).max);

        vm.prank(alice);
        usdc.approve(address(auction), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(auction), type(uint256).max);

        vm.prank(alice);
        coupon.setApprovalForAll(address(auction), true);
        vm.prank(bob);
        coupon.setApprovalForAll(address(auction), true);
    }

    // --- IERC1155Receiver ---
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
    // R1: Wash trading prevention (SelfTrade revert on buyer == seller)
    // =========================================================================
    function test_regression_R1_selfTradeReverts() public {
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(1);

        vm.prank(alice);
        vault.deposit(100e18);

        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // Alice attempts to buy her own auction -> reverts SelfTrade()
        vm.prank(alice);
        vm.expectRevert(PrismAuction.SelfTrade.selector);
        auction.buy(auctionId, 10e18, type(uint256).max);

        // Bob (distinct actor) can buy normally
        vm.prank(bob);
        auction.buy(auctionId, 10e18, type(uint256).max);
        assertEq(coupon.balanceOf(bob, 1), 10e18, "Bob received purchased coupons");
    }

    // =========================================================================
    // R2: Owner bait-and-switch (Auction creation/buy blocked if dividend unlocked)
    // =========================================================================
    function test_regression_R2_unlockedDividendReverts() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // 1. Before event is declared & locked, createAuction must revert DividendNotLocked
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.DividendNotLocked.selector, 1));
        auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // 2. Declared but not locked still reverts
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.DividendNotLocked.selector, 1));
        auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // 3. Locking the event allows auction creation
        dividendSource.lockEvent(1);
        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);
        assertTrue(auctionId > 0, "Auction created successfully after dividend is locked");

        // 4. Attempting to re-declare locked event reverts EventIsLocked in dividendSource
        vm.expectRevert(abi.encodeWithSelector(MockDividendSource.EventIsLocked.selector, 1));
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 3e6);

        // 5. Buying succeeds with locked event
        vm.prank(bob);
        auction.buy(auctionId, 10e18, type(uint256).max);
    }

    // =========================================================================
    // R3: Seal on zero epochs reverts with NoEpochs()
    // =========================================================================
    function test_regression_R3_sealZeroEpochsReverts() public {
        vm.prank(owner);
        PrismVault freshVault = new PrismVault(address(stock), address(usdc), address(dividendSource), false, false);

        assertEq(freshVault.epochCount(), 0, "Fresh vault has 0 epochs");

        // Attempting to seal with 0 epochs reverts NoEpochs()
        vm.prank(owner);
        vm.expectRevert(PrismVault.NoEpochs.selector);
        freshVault.seal();

        // Adding an epoch allows sealing
        vm.prank(owner);
        freshVault.createEpoch(T0 + 10 days, T0 + 15 days);
        vm.prank(owner);
        freshVault.seal();
        assertTrue(freshVault.isSealed(), "Vault sealed successfully after adding epoch");
    }

    // =========================================================================
    // M3: Collateral shortfall check on negative rebases / loss
    // =========================================================================
    function test_regression_M3_collateralShortfall() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Simulate shortfall: vault burns or transfers out 1 wei of collateral
        // We can do this by prank simulating transfer or burn from vault
        vm.prank(address(vault));
        stock.transfer(address(0xdead), 1e18);

        // Stock balance is now 99e18 while principal supply is 100e18
        assertLt(stock.balanceOf(address(vault)), principal.totalSupply());

        // deposit reverts CollateralShortfall
        vm.prank(bob);
        vm.expectRevert(PrismVault.CollateralShortfall.selector);
        vault.deposit(10e18);

        // recombine reverts CollateralShortfall
        vm.prank(alice);
        vm.expectRevert(PrismVault.CollateralShortfall.selector);
        vault.recombine(10e18);

        // redeemPrincipal reverts CollateralShortfall
        vm.warp(epoch2Ex + 35 days);
        vm.prank(alice);
        vm.expectRevert(PrismVault.CollateralShortfall.selector);
        vault.redeemPrincipal(10e18);

        // Top up collateral restores normal operations
        stock.mint(address(vault), 1e18);
        assertEq(stock.balanceOf(address(vault)), principal.totalSupply());

        // Redeem now succeeds
        uint256 aliceStockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.redeemPrincipal(10e18);
        assertEq(stock.balanceOf(alice) - aliceStockBefore, 10e18, "Redeem succeeded after restoring collateral");
    }

    // =========================================================================
    // R4: Funding defaulted visible event and status
    // =========================================================================
    function test_regression_R4_fundingDefaultedEmitted() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Warp past epoch 1 exDate but within 30-day grace period
        vm.warp(epoch1Ex + 10 days);
        (bool live1, bool awaiting1, bool defaulted1, uint256 graceEndsAt1) = vault.fundingStatus(1);
        assertFalse(live1);
        assertTrue(awaiting1);
        assertFalse(defaulted1);
        assertEq(graceEndsAt1, epoch1Ex + 30 days);

        // Warp past epoch 1 & 2 grace period (epoch2Ex + 30 days)
        vm.warp(epoch2Ex + 31 days);

        (,, bool defaultedAfterGrace,) = vault.fundingStatus(1);
        assertTrue(defaultedAfterGrace, "fundingStatus view reports defaulted true after grace");

        // The first exit (redeemPrincipal) emits FundingDefaulted(1) and FundingDefaulted(2)
        vm.expectEmit(true, false, false, false, address(vault));
        emit FundingDefaulted(1);
        vm.expectEmit(true, false, false, false, address(vault));
        emit FundingDefaulted(2);

        vm.prank(alice);
        vault.redeemPrincipal(50e18);

        // Subsequent redemption must NOT re-emit FundingDefaulted
        // We verify by recording logs
        vm.recordLogs();
        vm.prank(alice);
        vault.redeemPrincipal(50e18);
        // Ensure no new FundingDefaulted event was logged
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            assertTrue(
                entries[i].topics[0] != keccak256("FundingDefaulted(uint256)"),
                "FundingDefaulted should only be emitted once per defaulted epoch"
            );
        }
    }

    // =========================================================================
    // R5: Pausability without trapping funds (Guardian 2-step & Exit while paused)
    // =========================================================================
    function test_regression_R5_pauseExitWorks() public {
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(1);
        dividendSource.declareEvent(2, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(2);

        vm.prank(alice);
        vault.deposit(100e18);

        // 1. Guardian 2-step setup on vault
        vm.prank(owner);
        vault.transferGuardian(guardian);
        assertEq(vault.pendingGuardian(), guardian);

        vm.prank(guardian);
        vault.acceptGuardian();
        assertEq(vault.guardian(), guardian);
        assertEq(vault.pendingGuardian(), address(0));

        // 2. Guardian 2-step setup on auction
        vm.prank(owner);
        auction.transferGuardian(guardian);
        vm.prank(guardian);
        auction.acceptGuardian();
        assertEq(auction.guardian(), guardian);

        // 3. Guardian pauses vault & auction
        vm.prank(guardian);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(guardian);
        auction.pause();
        assertTrue(auction.paused());

        // 4. Deposit is blocked when paused
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(50e18);

        // 5. createAuction and buy are blocked when paused
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // 6. User exits MUST NOT be trapped while paused:
        // (a) recombine succeeds while paused
        uint256 aliceStockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.recombine(50e18);
        assertEq(stock.balanceOf(alice) - aliceStockBefore, 50e18, "recombine succeeded while paused");

        // (b) fundEpoch and claim succeed while paused
        usdc.mint(owner, 10_000e6);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        vault.fundEpoch(1);

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.claim(1, 50e18);
        assertGt(usdc.balanceOf(alice) - aliceUsdcBefore, 0, "claim succeeded while paused");

        // (c) redeemPrincipal succeeds while paused (after all epochs expire)
        vm.warp(epoch2Ex + 35 days);
        vm.prank(alice);
        vault.redeemPrincipal(50e18);
        assertEq(principal.balanceOf(alice), 0, "redeemPrincipal succeeded while paused");

        // 7. Unpause restores normal actions
        vm.prank(guardian);
        vault.unpause();
        assertFalse(vault.paused());

        vm.prank(bob);
        vault.deposit(50e18);
        assertEq(principal.balanceOf(bob), 50e18, "Deposit succeeded after unpause");
    }

    // =========================================================================
    // R6: Auction input bounds (duration cap, startPrice max, exDate clamp/reject)
    // =========================================================================
    function test_regression_R6_auctionInputBounds() public {
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(1);

        vm.prank(alice);
        vault.deposit(100e18);

        // 1. Duration > 30 days reverts InvalidDuration
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.InvalidDuration.selector, 30 days + 1, 30 days));
        auction.createAuction(1, 50e18, 2e6, 1e6, 30 days + 1);

        // 2. startPrice > type(uint128).max reverts InvalidPrice
        uint256 overflowPrice = uint256(type(uint128).max) + 1;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.InvalidPrice.selector, overflowPrice));
        auction.createAuction(1, 50e18, overflowPrice, 1e6, 1 days);

        // 3. Duration extends past epoch's exDate reverts AuctionExtendsPastExDate
        // epoch1Ex = T0 + 30 days. If current time is T0 + 20 days, duration of 11 days extends past exDate
        vm.warp(T0 + 20 days);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PrismAuction.AuctionExtendsPastExDate.selector, (T0 + 20 days) + 11 days, epoch1Ex)
        );
        auction.createAuction(1, 50e18, 2e6, 1e6, 11 days);

        // Valid boundary: 10 days ends exactly at epoch1Ex -> succeeds
        vm.prank(alice);
        uint256 validAuctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 10 days);
        assertTrue(validAuctionId > 0, "Auction bounded at exDate created successfully");
    }
}
