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

contract PrismAuctionTest is Test, IERC1155Receiver {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    PrincipalToken internal principal;
    EpochCoupon internal coupon;
    PrismAuction internal auction;

    address internal seller = makeAddr("seller");
    address internal buyer1 = makeAddr("buyer1");
    address internal buyer2 = makeAddr("buyer2");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal epoch1Ex;
    uint256 internal epoch2Ex;
    uint256 internal epoch3Ex;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vault = new PrismVault(address(stock), address(usdc), address(dividendSource));
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        auction = new PrismAuction(address(coupon), address(usdc), address(vault));

        epoch1Ex = T0 + 30 days;
        epoch2Ex = T0 + 60 days;
        epoch3Ex = T0 + 90 days;

        vault.createEpoch(epoch1Ex, epoch1Ex + 5 days);
        vault.createEpoch(epoch2Ex, epoch2Ex + 5 days);
        vault.createEpoch(epoch3Ex, epoch3Ex + 5 days);

        // Fund seller with stock and deposit to get coupons
        stock.mint(seller, 1_000e18);
        vm.startPrank(seller);
        stock.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e18);
        coupon.setApprovalForAll(address(auction), true);
        vm.stopPrank();

        // Fund buyers with USDC
        usdc.mint(buyer1, 10_000e6);
        usdc.mint(buyer2, 10_000e6);

        vm.prank(buyer1);
        usdc.approve(address(auction), type(uint256).max);

        vm.prank(buyer2);
        usdc.approve(address(auction), type(uint256).max);
    }

    // --- IERC1155Receiver ---
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

    // --- Price Decay Tests ---

    function test_priceAtT0_equalsStart() public {
        uint256 startPrice = 1_000_000; // 1.00 USDC
        uint256 floorPrice = 200_000;   // 0.20 USDC
        uint256 duration = 1_000;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, startPrice, floorPrice, duration);

        assertEq(auction.currentPrice(auctionId), startPrice, "Price at t=0 must equal startPrice");
    }

    function test_midpointIsExact() public {
        uint256 startPrice = 1_000_000;
        uint256 floorPrice = 200_000;
        uint256 duration = 1_000;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, startPrice, floorPrice, duration);

        // Warp exactly 500 seconds (halfway)
        vm.warp(T0 + 500);

        // Expected: 1_000_000 - ((800_000 * 500) / 1000) = 600_000
        uint256 expectedMidpoint = 600_000;
        assertEq(auction.currentPrice(auctionId), expectedMidpoint, "Midpoint price must be exact");
    }

    function test_clampsAtFloor() public {
        uint256 startPrice = 1_000_000;
        uint256 floorPrice = 200_000;
        uint256 duration = 1_000;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, startPrice, floorPrice, duration);

        // Warp to end of duration
        vm.warp(T0 + duration);
        assertEq(auction.currentPrice(auctionId), floorPrice, "Price at duration must equal floorPrice");

        // Warp far past duration
        vm.warp(T0 + duration + 50_000);
        assertEq(auction.currentPrice(auctionId), floorPrice, "Price past duration must clamp at floorPrice");
    }

    // --- Trading & Slippage Tests ---

    function test_partialFillsSumCorrectly() public {
        uint256 startPrice = 1_000_000;
        uint256 floorPrice = 200_000;
        uint256 duration = 1_000;
        uint256 totalAmount = 100e18;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, totalAmount, startPrice, floorPrice, duration);

        // Buyer 1 buys 40 coupons at t = 250
        vm.warp(T0 + 250);
        uint256 price1 = auction.currentPrice(auctionId); // 800_000
        assertEq(price1, 800_000);

        uint256 sellerUsdcBefore = usdc.balanceOf(seller);
        vm.prank(buyer1);
        auction.buy(auctionId, 40e18, price1);

        assertEq(coupon.balanceOf(buyer1, 1), 40e18, "Buyer 1 coupon balance mismatch");
        // Cost: 40 * 0.80 = 32 USDC
        assertEq(usdc.balanceOf(seller) - sellerUsdcBefore, 32e6, "Seller proceeds from fill 1 mismatch");

        // Buyer 2 buys remaining 60 coupons at t = 750
        vm.warp(T0 + 750);
        uint256 price2 = auction.currentPrice(auctionId); // 400_000
        assertEq(price2, 400_000);

        vm.prank(buyer2);
        auction.buy(auctionId, 60e18, price2);

        assertEq(coupon.balanceOf(buyer2, 1), 60e18, "Buyer 2 coupon balance mismatch");
        // Cost: 60 * 0.40 = 24 USDC
        assertEq(usdc.balanceOf(seller) - sellerUsdcBefore, 32e6 + 24e6, "Total seller proceeds mismatch");

        // Auction should now be closed and escrow empty
        PrismAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.amount, 0, "Auction remaining amount should be 0");
        assertFalse(a.active, "Auction should be marked inactive");
        assertEq(coupon.balanceOf(address(auction), 1), 0, "Escrow should be 0");
    }

    function test_maxPriceSlippageRevert() public {
        uint256 startPrice = 1_000_000;
        uint256 floorPrice = 200_000;
        uint256 duration = 1_000;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, startPrice, floorPrice, duration);

        // Warp to t = 200 (price is 840_000)
        vm.warp(T0 + 200);
        uint256 livePrice = auction.currentPrice(auctionId);

        // Buyer specifies maxPrice of 800_000 (lower than live price)
        vm.prank(buyer1);
        vm.expectRevert(
            abi.encodeWithSelector(PrismAuction.SlippageExceeded.selector, livePrice, 800_000)
        );
        auction.buy(auctionId, 10e18, 800_000);
    }

    // --- Cancellation Tests ---

    function test_cancelRefunds() public {
        uint256 startPrice = 1_000_000;
        uint256 floorPrice = 200_000;
        uint256 duration = 1_000;

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, startPrice, floorPrice, duration);

        // Partial fill of 30 coupons
        vm.warp(T0 + 500);
        vm.prank(buyer1);
        auction.buy(auctionId, 30e18, type(uint256).max);

        uint256 sellerCouponsBefore = coupon.balanceOf(seller, 1);

        // Seller cancels remaining 70 coupons
        vm.prank(seller);
        auction.cancel(auctionId);

        assertEq(coupon.balanceOf(seller, 1) - sellerCouponsBefore, 70e18, "Refund amount mismatch");
        assertEq(coupon.balanceOf(address(auction), 1), 0, "Escrow should be empty after cancel");

        PrismAuction.Auction memory a = auction.getAuction(auctionId);
        assertFalse(a.active, "Auction must be inactive");
        assertEq(a.amount, 0, "Auction remaining amount must be 0");
    }

    function test_nonSellerCancelReverts() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, 1_000_000, 200_000, 1_000);

        vm.prank(stranger);
        vm.expectRevert(PrismAuction.OnlySeller.selector);
        auction.cancel(auctionId);
    }

    // --- Batch Creation & Market Data Tests ---

    function test_batchCreatesNAuctions() public {
        uint256[] memory epochIds = new uint256[](3);
        epochIds[0] = 1;
        epochIds[1] = 2;
        epochIds[2] = 3;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 50e18;
        amounts[1] = 50e18;
        amounts[2] = 50e18;

        uint256[] memory startPrices = new uint256[](3);
        startPrices[0] = 1_000_000;
        startPrices[1] = 2_000_000;
        startPrices[2] = 3_000_000;

        uint256[] memory floorPrices = new uint256[](3);
        floorPrices[0] = 500_000;
        floorPrices[1] = 1_000_000;
        floorPrices[2] = 1_500_000;

        vm.prank(seller);
        uint256[] memory ids = auction.createBatchAuctions(
            epochIds,
            amounts,
            startPrices,
            floorPrices,
            3600
        );

        assertEq(ids.length, 3, "Should return 3 auction IDs");
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(ids[2], 3);

        for (uint256 i = 0; i < 3; ++i) {
            PrismAuction.Auction memory a = auction.getAuction(ids[i]);
            assertTrue(a.active);
            assertEq(a.epochId, epochIds[i]);
            assertEq(a.amount, amounts[i]);
            assertEq(a.startPrice, startPrices[i]);
            assertEq(a.floorPrice, floorPrices[i]);
        }

        // Active auction count per epoch
        (,, uint256 active1) = auction.getEpochMarketData(1);
        (,, uint256 active2) = auction.getEpochMarketData(2);
        (,, uint256 active3) = auction.getEpochMarketData(3);
        assertEq(active1, 1);
        assertEq(active2, 1);
        assertEq(active3, 1);
    }

    function test_lastClearingPriceUpdates() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 100e18, 1_000_000, 200_000, 1_000);

        (uint256 initialPrice, uint256 initialVol,) = auction.getEpochMarketData(1);
        assertEq(initialPrice, 0);
        assertEq(initialVol, 0);

        // Buyer purchases at t = 500 (price 600_000)
        vm.warp(T0 + 500);
        vm.prank(buyer1);
        auction.buy(auctionId, 25e18, type(uint256).max);

        (uint256 clearingPrice, uint256 volume, uint256 activeCount) = auction.getEpochMarketData(1);
        assertEq(clearingPrice, 600_000, "Clearing price not updated");
        assertEq(volume, 25e18, "Cumulative volume not updated");
        assertEq(activeCount, 1, "Auction should still be active");
    }

    function test_cannotAuctionSettledOrExpiredEpoch() public {
        // Warp past epoch 1 exDate
        vm.warp(epoch1Ex + 1);

        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismAuction.EpochPastExDate.selector,
                1,
                epoch1Ex,
                epoch1Ex + 1
            )
        );
        auction.createAuction(1, 50e18, 1e6, 0.5e6, 1000);

        // Declare and fund epoch 2
        dividendSource.declareEvent(2, IDividendSource.ActionType.DIVIDEND, 1e6);
        address funder = makeAddr("funder");
        usdc.mint(funder, 10_000e6);
        vm.prank(funder);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(funder);
        vault.fundEpoch(2);

        // Attempting to auction settled epoch 2 must revert
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.EpochAlreadyFunded.selector, 2));
        auction.createAuction(2, 50e18, 1e6, 0.5e6, 1000);
    }

    // --- Fuzz Reconciliation & Invariant Tests ---

    function testFuzz_reconciliationAndEscrowSolvency(
        uint256 auctionAmount,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 duration,
        uint256 warpTime,
        uint256 fillAmount
    ) public {
        auctionAmount = bound(auctionAmount, 1e18, 500e18);
        floorPrice = bound(floorPrice, 1, 10e6);
        startPrice = bound(startPrice, floorPrice, 50e6);
        duration = bound(duration, 10, 86400);
        warpTime = bound(warpTime, 0, duration * 2);
        fillAmount = bound(fillAmount, 1e18, auctionAmount);

        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            3,
            auctionAmount,
            startPrice,
            floorPrice,
            duration
        );

        // Advance clock & buy
        vm.warp(T0 + warpTime);
        uint256 price = auction.currentPrice(auctionId);

        _executeAndVerifyFill(auctionId, fillAmount, price);

        _verifyRemainingAndCancel(auctionId, auctionAmount - fillAmount);
    }

    function _executeAndVerifyFill(
        uint256 auctionId,
        uint256 fillAmount,
        uint256 price
    ) internal {
        uint256 expectedCost = (fillAmount * price) / 1e18;
        usdc.mint(buyer1, expectedCost);

        uint256 sellerBefore = usdc.balanceOf(seller);
        uint256 buyerBefore = usdc.balanceOf(buyer1);

        vm.prank(buyer1);
        auction.buy(auctionId, fillAmount, price);

        assertEq(usdc.balanceOf(seller) - sellerBefore, expectedCost, "Seller proceeds mismatch");
        assertEq(buyerBefore - usdc.balanceOf(buyer1), expectedCost, "Buyer cost mismatch");
        assertEq(coupon.balanceOf(buyer1, 3), fillAmount, "Buyer coupon balance mismatch");
    }

    function _verifyRemainingAndCancel(uint256 auctionId, uint256 expectedRemaining) internal {
        assertEq(auction.getAuction(auctionId).amount, expectedRemaining, "Auction remaining mismatch");
        assertEq(coupon.balanceOf(address(auction), 3), expectedRemaining, "Escrow mismatch");

        if (expectedRemaining > 0) {
            uint256 sellerCouponsBefore = coupon.balanceOf(seller, 3);
            vm.prank(seller);
            auction.cancel(auctionId);

            assertEq(
                coupon.balanceOf(seller, 3) - sellerCouponsBefore,
                expectedRemaining,
                "Cancel refund mismatch"
            );
            assertEq(coupon.balanceOf(address(auction), 3), 0, "Escrow not empty after cancel");
        }
    }
}
