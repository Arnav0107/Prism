// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismZap} from "../contracts/PrismZap.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";

contract PrismZapTest is Test {
    PrismZap public zap;
    PrismVault public vault;
    PrismAuction public auction;
    PrincipalToken public principal;
    EpochCoupon public coupon;
    MockStock public stock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;

    address public owner = address(0xAA);
    address public alice = address(0x11);
    address public buyer = address(0x22);

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
        auction = new PrismAuction(address(coupon), address(usdc), address(vault));

        for (uint256 i = 1; i <= 4; ++i) {
            vault.createEpoch(T0 + (i * 90 days), T0 + (i * 90 days) + 5 days);
            dividendSource.declareEvent(i, IDividendSource.ActionType.DIVIDEND, 1_500_000);
            dividendSource.lockEvent(i);
        }
        vault.seal();
        vm.stopPrank();

        zap = new PrismZap();

        stock.mint(alice, 10_000e18);
        usdc.mint(buyer, 1_000_000e6);

        vm.prank(alice);
        stock.approve(address(zap), type(uint256).max);

        vm.prank(buyer);
        usdc.approve(address(auction), type(uint256).max);
    }

    function test_zap_depositAndListAllCoupons() public {
        uint256[] memory epochIds = new uint256[](4);
        uint256[] memory startPrices = new uint256[](4);
        uint256[] memory floorPrices = new uint256[](4);

        for (uint256 i = 0; i < 4; ++i) {
            epochIds[i] = i + 1;
            startPrices[i] = 1_500_000;
            floorPrices[i] = 1_000_000;
        }

        vm.prank(alice);
        uint256[] memory auctionIds = zap.depositAndListCoupons(
            address(vault),
            address(auction),
            100e18,
            epochIds,
            startPrices,
            floorPrices,
            7 days
        );

        assertEq(auctionIds.length, 4, "4 auctions created");

        // Alice receives 100 PT
        assertEq(principal.balanceOf(alice), 100e18, "Alice received 100 PT");

        // Zap retains 0 PT and 0 coupons
        assertEq(principal.balanceOf(address(zap)), 0, "Zap holds 0 PT");
        for (uint256 i = 1; i <= 4; ++i) {
            assertEq(coupon.balanceOf(address(zap), i), 0, "Zap holds 0 coupons");
        }

        // Each auction has Alice as seller
        for (uint256 i = 0; i < 4; ++i) {
            PrismAuction.Auction memory a = auction.getAuction(auctionIds[i]);
            assertEq(a.seller, alice, "Alice is the auction seller");
            assertEq(a.epochId, i + 1, "Epoch matches");
            assertEq(a.amount, 100e18, "Auction amount is 100");
            assertTrue(a.active, "Auction is active");
        }
    }

    function test_zap_cancelReturnsCouponsToAlice() public {
        uint256[] memory epochIds = new uint256[](1);
        uint256[] memory startPrices = new uint256[](1);
        uint256[] memory floorPrices = new uint256[](1);

        epochIds[0] = 1;
        startPrices[0] = 1_500_000;
        floorPrices[0] = 1_000_000;

        vm.prank(alice);
        uint256[] memory auctionIds = zap.depositAndListCoupons(
            address(vault),
            address(auction),
            50e18,
            epochIds,
            startPrices,
            floorPrices,
            7 days
        );

        assertEq(coupon.balanceOf(alice, 1), 0, "Alice holds 0 coupon before cancel");

        // Alice cancels her auction
        vm.prank(alice);
        auction.cancel(auctionIds[0]);

        assertEq(coupon.balanceOf(alice, 1), 50e18, "Alice received escrowed coupons back on cancel");
    }

    function test_zap_buyerPurchasePaysAliceDirectly() public {
        uint256[] memory epochIds = new uint256[](1);
        uint256[] memory startPrices = new uint256[](1);
        uint256[] memory floorPrices = new uint256[](1);

        epochIds[0] = 1;
        startPrices[0] = 1_500_000; // 1.50 USDC
        floorPrices[0] = 1_000_000;

        vm.prank(alice);
        uint256[] memory auctionIds = zap.depositAndListCoupons(
            address(vault),
            address(auction),
            100e18,
            epochIds,
            startPrices,
            floorPrices,
            7 days
        );

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        // Buyer purchases 100 coupons from Alice's auction at start price
        vm.prank(buyer);
        auction.buy(auctionIds[0], 100e18, 1_500_000);

        uint256 aliceUsdcAfter = usdc.balanceOf(alice);
        assertEq(aliceUsdcAfter - aliceUsdcBefore, 150e6, "Alice received 150 USDC directly from purchase");
        assertEq(coupon.balanceOf(buyer, 1), 100e18, "Buyer received 100 coupons");
    }

    function test_zap_validations() public {
        uint256[] memory empty = new uint256[](0);

        vm.expectRevert(PrismZap.ZeroAddress.selector);
        zap.depositAndListCoupons(address(0), address(auction), 100e18, empty, empty, empty, 7 days);

        vm.expectRevert(PrismZap.ZeroAddress.selector);
        zap.depositAndListCoupons(address(vault), address(0), 100e18, empty, empty, empty, 7 days);

        vm.expectRevert(PrismZap.ZeroAmount.selector);
        zap.depositAndListCoupons(address(vault), address(auction), 0, empty, empty, empty, 7 days);
    }
}
