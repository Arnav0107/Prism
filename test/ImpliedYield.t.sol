// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {MockReferencePrice} from "../contracts/MockReferencePrice.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";

contract ImpliedYieldTest is Test {
    MockStock public stock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;
    MockReferencePrice public referencePrice;
    PrismVault public vault;
    PrismAuction public auction;
    EpochCoupon public coupon;

    address public seller = makeAddr("seller");
    address public buyer = makeAddr("buyer");

    function setUp() public {
        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        // Stock reference price: $100.00 = 100_000_000 (6 decimals)
        referencePrice = new MockReferencePrice(100_000_000);

        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        auction = new PrismAuction(address(vault.epochCoupon()), address(usdc), address(vault));
        coupon = vault.epochCoupon();

        vault.createEpoch(block.timestamp + 30 days, block.timestamp + 40 days);
        vault.createEpoch(block.timestamp + 60 days, block.timestamp + 70 days);

        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 2e6);
        dividendSource.lockEvent(1);

        stock.mint(seller, 100e18);
        vm.startPrank(seller);
        stock.approve(address(vault), 100e18);
        vault.deposit(100e18);
        coupon.setApprovalForAll(address(auction), true);
        vm.stopPrank();

        usdc.mint(buyer, 1_000e6);
        vm.prank(buyer);
        usdc.approve(address(auction), type(uint256).max);
    }

    function test_impliedYield_zeroWhenNoTrades() public {
        // With no trades, VWAP is 0 -> yieldBps is 0
        uint256 yieldBps = auction.impliedQuarterlyYieldBps(1, address(referencePrice));
        assertEq(yieldBps, 0);
    }

    function test_impliedYield_computesCorrectBasisPoints() public {
        // Seller lists 10 coupons at startPrice = floorPrice = $1.50 (1_500_000)
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(1, 10e18, 1_500_000, 1_500_000, 1000);

        // Buyer buys all 10 coupons at $1.50
        vm.prank(buyer);
        auction.buy(auctionId, 10e18, 1_500_000);

        // VWAP is $1.50. Reference price is $100.00.
        // Yield = 1.50 / 100.00 = 1.5% = 150 bps
        uint256 yieldBps = auction.impliedQuarterlyYieldBps(1, address(referencePrice));
        assertEq(yieldBps, 150);
    }

    function test_impliedYield_revertsOnStalePrice() public {
        // Advance time past 1 day without updating oracle
        vm.warp(block.timestamp + 1 days + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                PrismAuction.StaleReferencePrice.selector,
                block.timestamp - (1 days + 1),
                block.timestamp
            )
        );
        auction.impliedQuarterlyYieldBps(1, address(referencePrice));
    }

    function test_impliedYield_revertsOnZeroPrice() public {
        referencePrice.setPrice(0);
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.InvalidReferencePrice.selector));
        auction.impliedQuarterlyYieldBps(1, address(referencePrice));
    }

    function test_impliedYield_revertsOnZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(PrismAuction.InvalidReferencePrice.selector));
        auction.impliedQuarterlyYieldBps(1, address(0));
    }
}
