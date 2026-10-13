// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrismFactory} from "../contracts/PrismFactory.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";

contract PrismFactoryTest is Test {
    PrismFactory public factory;
    MockStock public stockA;
    MockStock public stockB;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;

    address public owner = address(0xAA);
    address public seriesManager = address(0xBB);

    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed stock,
        address vault,
        address principalToken,
        address epochCoupon,
        address auction,
        address seriesOwner
    );

    function setUp() public {
        vm.prank(owner);
        factory = new PrismFactory();

        stockA = new MockStock();
        stockB = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();
    }

    function test_factory_zeroAddressReverts() public {
        vm.expectRevert(PrismFactory.ZeroAddress.selector);
        factory.createSeries(address(0), address(usdc), address(dividendSource), true, false, seriesManager);

        vm.expectRevert(PrismFactory.ZeroAddress.selector);
        factory.createSeries(address(stockA), address(0), address(dividendSource), true, false, seriesManager);

        vm.expectRevert(PrismFactory.ZeroAddress.selector);
        factory.createSeries(address(stockA), address(usdc), address(0), true, false, seriesManager);

        vm.expectRevert(PrismFactory.ZeroAddress.selector);
        factory.createSeries(address(stockA), address(usdc), address(dividendSource), true, false, address(0));
    }

    function test_factory_createSeriesAndEnum() public {
        assertEq(factory.seriesCount(), 0);

        (address vaultAddr, address ptAddr, address ecAddr, address auctionAddr) =
            factory.createSeries(address(stockA), address(usdc), address(dividendSource), true, false, seriesManager);

        assertTrue(vaultAddr != address(0));
        assertTrue(ptAddr != address(0));
        assertTrue(ecAddr != address(0));
        assertTrue(auctionAddr != address(0));

        assertEq(factory.seriesCount(), 1);

        PrismFactory.SeriesInfo memory info0 = factory.seriesAt(0);
        assertEq(info0.stock, address(stockA));
        assertEq(info0.usdc, address(usdc));
        assertEq(info0.dividendSource, address(dividendSource));
        assertEq(info0.vault, vaultAddr);
        assertEq(info0.principalToken, ptAddr);
        assertEq(info0.epochCoupon, ecAddr);
        assertEq(info0.auction, auctionAddr);
        assertFalse(info0.inKindDividends);
        assertEq(info0.seriesOwner, seriesManager);

        // Check ownership delegation (both use Ownable2Step)
        PrismAuction auction = PrismAuction(auctionAddr);
        assertEq(auction.pendingOwner(), seriesManager, "Auction pendingOwner set to seriesManager");
        vm.prank(seriesManager);
        auction.acceptOwnership();
        assertEq(auction.owner(), seriesManager, "Auction ownership accepted by seriesManager");

        PrismVault vault = PrismVault(vaultAddr);
        assertEq(vault.pendingOwner(), seriesManager, "Vault pendingOwner set to seriesManager");
        vm.prank(seriesManager);
        vault.acceptOwnership();
        assertEq(vault.owner(), seriesManager, "Vault ownership accepted by seriesManager");
    }

    function test_factory_multiSeriesRegistry() public {
        // Deploy Series 1 (Standard Stock A)
        factory.createSeries(address(stockA), address(usdc), address(dividendSource), true, false, seriesManager);

        // Deploy Series 2 (In-kind Rebasing Stock B)
        factory.createSeries(address(stockB), address(usdc), address(dividendSource), true, true, seriesManager);

        assertEq(factory.seriesCount(), 2);

        PrismFactory.SeriesInfo[] memory all = factory.allSeries();
        assertEq(all.length, 2);
        assertEq(all[0].stock, address(stockA));
        assertFalse(all[0].inKindDividends);
        assertEq(all[1].stock, address(stockB));
        assertTrue(all[1].inKindDividends);

        // Out of bounds reverts
        vm.expectRevert(PrismFactory.IndexOutOfBounds.selector);
        factory.seriesAt(2);
    }
}
