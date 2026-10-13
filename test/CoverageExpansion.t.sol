// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";

/**
 * @title CoverageExpansionTest
 * @notice Targeted branch and edge-case unit tests to ensure >=95% line and >=85% branch coverage
 *         across PrismVault and PrismAuction.
 */
contract CoverageExpansionTest is Test, IERC1155Receiver {
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
    address internal stranger = makeAddr("stranger");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal epoch1Ex;
    uint256 internal epoch2Ex;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();

        vm.startPrank(owner);
        dividendSource = new MockDividendSource();
        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        auction = new PrismAuction(address(coupon), address(usdc), address(vault));

        epoch1Ex = T0 + 30 days;
        epoch2Ex = T0 + 60 days;

        vault.createEpoch(epoch1Ex, epoch1Ex + 5 days);
        vault.createEpoch(epoch2Ex, epoch2Ex + 5 days);

        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        dividendSource.lockEvent(1);
        dividendSource.declareEvent(2, IDividendSource.ActionType.DIVIDEND, 2e6);
        dividendSource.lockEvent(2);
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
    // PrismVault Branches
    // =========================================================================

    function test_vault_constructor_zeroAddressReverts() public {
        vm.expectRevert(PrismVault.ZeroAddress.selector);
        new PrismVault(address(0), address(usdc), address(dividendSource), false);

        vm.expectRevert(PrismVault.ZeroAddress.selector);
        new PrismVault(address(stock), address(0), address(dividendSource), false);

        vm.expectRevert(PrismVault.ZeroAddress.selector);
        new PrismVault(address(stock), address(usdc), address(0), false);
    }

    function test_vault_guardian_branches() public {
        // Zero address revert
        vm.prank(owner);
        vm.expectRevert(PrismVault.ZeroAddress.selector);
        vault.transferGuardian(address(0));

        // Transfer guardian
        vm.prank(owner);
        vault.transferGuardian(guardian);

        // Stranger cannot accept
        vm.prank(stranger);
        vm.expectRevert(PrismVault.NotPendingGuardian.selector);
        vault.acceptGuardian();

        // Valid guardian accepts
        vm.prank(guardian);
        vault.acceptGuardian();

        // Stranger cannot pause
        vm.prank(stranger);
        vm.expectRevert(PrismVault.NotGuardian.selector);
        vault.pause();

        // Stranger cannot unpause
        vm.prank(stranger);
        vm.expectRevert(PrismVault.NotGuardian.selector);
        vault.unpause();

        // Owner can pause and unpause
        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_vault_deposit_branches() public {
        // Zero amount deposit
        vm.prank(alice);
        vm.expectRevert(PrismVault.ZeroAmount.selector);
        vault.deposit(0);

        // Deposit on unsealed vault with 0 epochs
        PrismVault emptyVault = new PrismVault(address(stock), address(usdc), address(dividendSource), false);
        vm.prank(alice);
        vm.expectRevert(PrismVault.NoEpochs.selector);
        emptyVault.deposit(10e18);
    }

    function test_vault_fundEpoch_branches() public {
        // Epoch 0 or out of bounds
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 0));
        vault.fundEpoch(0);

        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 999));
        vault.fundEpoch(999);
    }

    function test_vault_claim_branches() public {
        // Zero amount claim
        vm.expectRevert(PrismVault.ZeroAmount.selector);
        vault.claim(1, 0);

        // Epoch 0 or out of bounds
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 0));
        vault.claim(0, 10e18);

        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 999));
        vault.claim(999, 10e18);

        // Insufficient balance on funded epoch
        usdc.mint(owner, 10_000e6);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        vault.fundEpoch(1);

        vm.prank(stranger);
        vm.expectRevert(PrismVault.InsufficientBalance.selector);
        vault.claim(1, 10e18);
    }

    function test_vault_recombine_branches() public {
        // Zero amount recombine
        vm.prank(alice);
        vm.expectRevert(PrismVault.ZeroAmount.selector);
        vault.recombine(0);

        // Recombine with insufficient principal
        vm.prank(alice);
        vm.expectRevert(PrismVault.InsufficientBalance.selector);
        vault.recombine(10e18);

        // Deposit to get PT and EC
        vm.prank(alice);
        vault.deposit(100e18);

        // Transfer away some coupons for epoch 1, so PT balance > EC balance
        vm.prank(alice);
        coupon.safeTransferFrom(alice, stranger, 1, 50e18, "");

        // Recombine 100e18 should revert InsufficientBalance for epoch 1 coupons
        vm.prank(alice);
        vm.expectRevert(PrismVault.InsufficientBalance.selector);
        vault.recombine(100e18);

        // Defaulted epoch emission during recombine
        // Warp past epoch 1 grace period without funding
        // Epoch 2 is still live (exDate = T0 + 60 days), warp to T0 + 61 days (past epoch 1 grace which is T0 + 60 days)
        // Wait, epoch 2 exDate is T0 + 60 days, so at T0 + 61 days epoch 2 is awaiting funding
        // Fund epoch 2 so it is skipped during recombine:
        usdc.mint(owner, 10_000e6);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        vault.fundEpoch(2);

        // Now warp past epoch 1 grace (T0 + 60 days + 1 = T0 + 61 days)
        vm.warp(T0 + 61 days);

        // Return coupons to alice so she can recombine remaining
        vm.prank(stranger);
        coupon.safeTransferFrom(stranger, alice, 1, 50e18, "");

        // Recombine should emit FundingDefaulted(1)
        vm.prank(alice);
        vault.recombine(50e18);
        assertTrue(vault.epochDefaulted(1), "Epoch 1 marked defaulted via recombine");
    }

    function test_vault_redeemPrincipal_branches() public {
        // Zero amount redeemPrincipal
        vm.prank(alice);
        vm.expectRevert(PrismVault.ZeroAmount.selector);
        vault.redeemPrincipal(0);

        // Deposit 100e18
        vm.prank(alice);
        vault.deposit(100e18);

        // Awaiting funding revert on redeemPrincipal
        vm.warp(epoch2Ex + 5 days); // Past all exDates, but within epoch 2 grace
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochAwaitingFunding.selector, 2, epoch2Ex + 30 days));
        vault.redeemPrincipal(50e18);

        // Warp past grace period
        vm.warp(epoch2Ex + 35 days);

        // Insufficient principal balance
        vm.prank(alice);
        vm.expectRevert(PrismVault.InsufficientBalance.selector);
        vault.redeemPrincipal(200e18);
    }

    function test_vault_fundingStatus_outOfBoundsReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 0));
        vault.fundingStatus(0);

        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochDoesNotExist.selector, 999));
        vault.fundingStatus(999);
    }

    // =========================================================================
    // PrismAuction Branches
    // =========================================================================

    function test_auction_constructor_zeroAddressReverts() public {
        vm.expectRevert(PrismAuction.ZeroAddress.selector);
        new PrismAuction(address(0), address(usdc), address(vault));

        vm.expectRevert(PrismAuction.ZeroAddress.selector);
        new PrismAuction(address(coupon), address(0), address(vault));

        vm.expectRevert(PrismAuction.ZeroAddress.selector);
        new PrismAuction(address(coupon), address(usdc), address(0));
    }

    function test_auction_guardian_branches() public {
        // Zero address revert
        vm.prank(owner);
        vm.expectRevert(PrismAuction.ZeroAddress.selector);
        auction.transferGuardian(address(0));

        // Transfer guardian
        vm.prank(owner);
        auction.transferGuardian(guardian);

        // Stranger cannot accept
        vm.prank(stranger);
        vm.expectRevert(PrismAuction.NotPendingGuardian.selector);
        auction.acceptGuardian();

        // Valid guardian accepts
        vm.prank(guardian);
        auction.acceptGuardian();

        // Stranger cannot pause
        vm.prank(stranger);
        vm.expectRevert(PrismAuction.NotGuardian.selector);
        auction.pause();

        // Stranger cannot unpause
        vm.prank(stranger);
        vm.expectRevert(PrismAuction.NotGuardian.selector);
        auction.unpause();

        // Owner can pause and unpause
        vm.prank(owner);
        auction.pause();
        assertTrue(auction.paused());

        vm.prank(owner);
        auction.unpause();
        assertFalse(auction.paused());
    }

    function test_auction_batch_lengthMismatchReverts() public {
        uint256[] memory epochIds = new uint256[](2);
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory startPrices = new uint256[](2);
        uint256[] memory floorPrices = new uint256[](2);

        vm.prank(alice);
        vm.expectRevert(PrismAuction.ArrayLengthMismatch.selector);
        auction.createBatchAuctions(epochIds, amounts, startPrices, floorPrices, 1 days);
    }

    function test_auction_createAuction_branches() public {
        // Zero amount
        vm.prank(alice);
        vm.expectRevert(PrismAuction.ZeroAmount.selector);
        auction.createAuction(1, 0, 2e6, 1e6, 1 days);

        // Zero duration
        vm.prank(alice);
        vm.expectRevert(PrismAuction.InvalidDuration.selector);
        auction.createAuction(1, 50e18, 2e6, 1e6, 0);

        // Zero floor price
        vm.prank(alice);
        vm.expectRevert(PrismAuction.InvalidPrice.selector);
        auction.createAuction(1, 50e18, 2e6, 0, 1 days);

        // Invalid epoch ID
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.EpochDoesNotExist.selector, 0));
        auction.createAuction(0, 50e18, 2e6, 1e6, 1 days);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.EpochDoesNotExist.selector, 999));
        auction.createAuction(999, 50e18, 2e6, 1e6, 1 days);

        // floorPrice > startPrice
        vm.prank(alice);
        vm.expectRevert(PrismAuction.InvalidPrice.selector);
        auction.createAuction(1, 50e18, 1e6, 2e6, 1 days);
    }

    function test_auction_buy_branches() public {
        // AuctionNotActive: id = 0 or >= nextAuctionId
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotActive.selector, 0));
        auction.buy(0, 10e18, type(uint256).max);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotActive.selector, 999));
        auction.buy(999, 10e18, type(uint256).max);

        // Create auction
        vm.prank(alice);
        vault.deposit(100e18);

        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // Buy with 0 amount
        vm.prank(bob);
        vm.expectRevert(PrismAuction.ZeroAmount.selector);
        auction.buy(auctionId, 0, type(uint256).max);

        // Buy with amount > auction.amount
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.InsufficientAuctionLiquidity.selector, 100e18, 50e18));
        auction.buy(auctionId, 100e18, type(uint256).max);

        // Cancel it so it's inactive
        vm.prank(alice);
        auction.cancel(auctionId);

        // Buy on inactive auction
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotActive.selector, auctionId));
        auction.buy(auctionId, 10e18, type(uint256).max);
    }

    function test_auction_currentPrice_notFoundReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotFound.selector, 0));
        auction.currentPrice(0);

        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotFound.selector, 999));
        auction.currentPrice(999);
    }

    function test_auction_cancel_notFoundReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotActive.selector, 0));
        auction.cancel(0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.AuctionNotActive.selector, 999));
        auction.cancel(999);
    }

    function test_auction_vwap_and_clearingPrice_directCalls() public {
        // Zero volume returns 0
        assertEq(auction.vwap(1), 0);
        assertEq(auction.lastClearingPrice(1), 0);

        // Create and trade
        vm.prank(alice);
        vault.deposit(100e18);

        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        vm.prank(bob);
        auction.buy(auctionId, 20e18, type(uint256).max);

        uint256 priceVwap = auction.vwap(1);
        assertGt(priceVwap, 0, "VWAP computed after trade");
        assertEq(auction.lastClearingPrice(1), priceVwap, "lastClearingPrice equals VWAP");
    }

    function test_auction_currentPrice_expired_clampsFloor() public {
        vm.prank(alice);
        vault.deposit(100e18);

        vm.prank(alice);
        uint256 auctionId = auction.createAuction(1, 50e18, 2e6, 1e6, 1 days);

        // Advance clock past duration
        vm.warp(T0 + 2 days);
        assertEq(auction.currentPrice(auctionId), 1e6, "Clamped at floor price");
    }
}
