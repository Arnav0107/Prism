// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {PrismAuction} from "../contracts/PrismAuction.sol";

/**
 * @title ProtocolHandler
 * @notice Stateful handler driving random multi-actor lifecycle operations across Prism.
 */
contract ProtocolHandler is Test, IERC1155Receiver {
    MockStock public stock;
    MockUSDC public usdc;
    MockDividendSource public dividendSource;
    PrismVault public vault;
    PrincipalToken public principal;
    EpochCoupon public coupon;
    PrismAuction public auction;

    address[3] public actors;
    uint256 public constant T0 = 1_000_000;

    uint256[] public activeAuctionIds;

    constructor(
        MockStock _stock,
        MockUSDC _usdc,
        MockDividendSource _dividendSource,
        PrismVault _vault,
        PrismAuction _auction,
        address[3] memory _actors
    ) {
        stock = _stock;
        usdc = _usdc;
        dividendSource = _dividendSource;
        vault = _vault;
        principal = vault.principalToken();
        coupon = vault.epochCoupon();
        auction = _auction;
        actors = _actors;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function deposit(uint256 actorSeed, uint256 amountSeed) external {
        address actor = actors[actorSeed % 3];
        uint256 amount = bound(amountSeed, 1e18, 500e18);

        stock.mint(actor, amount);
        vm.startPrank(actor);
        stock.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function recombine(uint256 actorSeed, uint256 amountSeed) external {
        address actor = actors[actorSeed % 3];
        uint256 userPrincipal = principal.balanceOf(actor);
        if (userPrincipal == 0) return;

        uint256 maxRecombine = userPrincipal;
        uint256 total = vault.epochCount();

        // Check if any epoch is awaiting funding (blocks recombine)
        for (uint256 i = 1; i <= total; ++i) {
            (, bool awaiting,) = vault.fundingStatus(i);
            if (awaiting) return;
        }

        // Must have sufficient coupons for all live epochs
        for (uint256 i = 1; i <= total; ++i) {
            (bool live,,) = vault.fundingStatus(i);
            if (live) {
                uint256 cBal = coupon.balanceOf(actor, i);
                if (cBal < maxRecombine) {
                    maxRecombine = cBal;
                }
            }
        }

        if (maxRecombine == 0) return;
        uint256 amount = bound(amountSeed, 1, maxRecombine);

        vm.prank(actor);
        vault.recombine(amount);
    }

    function fundEpoch(uint256 epochSeed, uint256 dividendSeed) external {
        uint256 epochCount = vault.epochCount();
        if (epochCount == 0) return;
        uint256 epochId = (epochSeed % epochCount) + 1;

        PrismVault.EpochInfo memory info = vault.getEpoch(epochId);
        if (info.funded) return;

        uint256 usdcPerShare = bound(dividendSeed, 0.1e6, 5e6);
        dividendSource.declareEvent(epochId, IDividendSource.ActionType.DIVIDEND, usdcPerShare);
        dividendSource.lockEvent(epochId);

        uint256 currentSupply = coupon.totalSupply(epochId);
        uint256 payout = (currentSupply * usdcPerShare) / 1e18;

        address funder = actors[0];
        if (payout > 0) {
            usdc.mint(funder, payout);
        }
        vm.startPrank(funder);
        usdc.approve(address(vault), payout);
        vault.fundEpoch(epochId);
        vm.stopPrank();
    }

    function claim(uint256 actorSeed, uint256 epochSeed, uint256 amountSeed) external {
        uint256 epochCount = vault.epochCount();
        if (epochCount == 0) return;
        uint256 epochId = (epochSeed % epochCount) + 1;

        PrismVault.EpochInfo memory info = vault.getEpoch(epochId);
        if (!info.funded) return;

        address actor = actors[actorSeed % 3];
        uint256 bal = coupon.balanceOf(actor, epochId);
        if (bal == 0) return;

        uint256 amount = bound(amountSeed, 1, bal);
        vm.prank(actor);
        vault.claim(epochId, amount);
    }

    function createAuction(
        uint256 actorSeed,
        uint256 epochSeed,
        uint256 amountSeed,
        uint256 startPriceSeed,
        uint256 floorPriceSeed,
        uint256 durationSeed
    ) external {
        uint256 epochCount = vault.epochCount();
        if (epochCount == 0) return;
        uint256 epochId = (epochSeed % epochCount) + 1;

        PrismVault.EpochInfo memory info = vault.getEpoch(epochId);
        if (info.funded || block.timestamp >= info.exDate) return;

        address seller = actors[actorSeed % 3];
        uint256 bal = coupon.balanceOf(seller, epochId);
        if (bal < auction.MIN_FILL()) return;

        uint256 amount = bound(amountSeed, auction.MIN_FILL(), bal);
        uint256 floorPrice = bound(floorPriceSeed, 0.05e6, 2e6);
        uint256 startPrice = bound(startPriceSeed, floorPrice, 10e6);
        uint256 duration = bound(durationSeed, 60, 7 days);

        vm.startPrank(seller);
        coupon.setApprovalForAll(address(auction), true);
        uint256 auctionId = auction.createAuction(epochId, amount, startPrice, floorPrice, duration);
        vm.stopPrank();

        activeAuctionIds.push(auctionId);
    }

    function buyAuction(uint256 actorSeed, uint256 auctionIdxSeed, uint256 buyAmountSeed) external {
        if (activeAuctionIds.length == 0) return;
        uint256 idx = auctionIdxSeed % activeAuctionIds.length;
        uint256 auctionId = activeAuctionIds[idx];

        PrismAuction.Auction memory a = auction.getAuction(auctionId);
        if (!a.active) {
            _removeActiveAuction(idx);
            return;
        }

        PrismVault.EpochInfo memory info = vault.getEpoch(a.epochId);
        if (info.funded || block.timestamp >= info.exDate) return;

        uint256 minFill = auction.MIN_FILL();
        uint256 buyAmount;
        if (a.amount <= minFill) {
            buyAmount = a.amount;
        } else {
            buyAmount = bound(buyAmountSeed, minFill, a.amount);
        }

        address buyer = actors[actorSeed % 3];
        uint256 price = auction.currentPrice(auctionId);
        uint256 totalCost = Math.mulDiv(buyAmount, price, 1e18, Math.Rounding.Ceil);

        usdc.mint(buyer, totalCost);
        vm.startPrank(buyer);
        usdc.approve(address(auction), totalCost);
        auction.buy(auctionId, buyAmount, type(uint256).max);
        vm.stopPrank();

        if (a.amount - buyAmount == 0) {
            _removeActiveAuction(idx);
        }
    }

    function cancelAuction(uint256 auctionIdxSeed) external {
        if (activeAuctionIds.length == 0) return;
        uint256 idx = auctionIdxSeed % activeAuctionIds.length;
        uint256 auctionId = activeAuctionIds[idx];

        PrismAuction.Auction memory a = auction.getAuction(auctionId);
        if (!a.active) {
            _removeActiveAuction(idx);
            return;
        }

        vm.prank(a.seller);
        auction.cancel(auctionId);
        _removeActiveAuction(idx);
    }

    function warpTime(uint256 secondsSeed) external {
        uint256 jump = bound(secondsSeed, 1 hours, 10 days);
        vm.warp(block.timestamp + jump);
    }

    function getActiveAuctionIds() external view returns (uint256[] memory) {
        return activeAuctionIds;
    }

    function _removeActiveAuction(uint256 idx) internal {
        activeAuctionIds[idx] = activeAuctionIds[activeAuctionIds.length - 1];
        activeAuctionIds.pop();
    }
}

/**
 * @title InvariantsTest
 * @notice Stateful invariant test suite asserting system-wide solvency invariants.
 */
contract InvariantsTest is Test, IERC1155Receiver {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    PrincipalToken internal principal;
    EpochCoupon internal coupon;
    PrismAuction internal auction;
    ProtocolHandler internal handler;

    address internal actor1 = makeAddr("actor1");
    address internal actor2 = makeAddr("actor2");
    address internal actor3 = makeAddr("actor3");

    uint256 internal constant T0 = 1_000_000;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true);
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        auction = new PrismAuction(address(coupon), address(usdc), address(vault));

        // Create 4 distribution epochs
        vault.createEpoch(T0 + 90 days, T0 + 95 days);
        vault.createEpoch(T0 + 180 days, T0 + 185 days);
        vault.createEpoch(T0 + 270 days, T0 + 275 days);
        vault.createEpoch(T0 + 360 days, T0 + 365 days);

        address[3] memory actors = [actor1, actor2, actor3];
        handler = new ProtocolHandler(stock, usdc, dividendSource, vault, auction, actors);

        targetContract(address(handler));
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // =========================================================================
    // Invariant 1: stock.balanceOf(vault) == principal.totalSupply()
    // =========================================================================
    function invariant_stockLockedEqualsPrincipalSupply() public view {
        assertEq(
            stock.balanceOf(address(vault)),
            principal.totalSupply(),
            "Invariant 1 Violated: Vault stock collateral balance != PrincipalToken total supply"
        );
    }

    // =========================================================================
    // Invariant 2: For each live epoch, coupon.totalSupply(e) <= principal.totalSupply()
    // =========================================================================
    function invariant_couponSupplyBoundedByPrincipalSupply() public view {
        uint256 count = vault.epochCount();
        for (uint256 e = 1; e <= count; ++e) {
            (bool live,,) = vault.fundingStatus(e);
            if (live) {
                assertLe(
                    coupon.totalSupply(e),
                    principal.totalSupply(),
                    "Invariant 2 Violated: Live EpochCoupon total supply exceeds PrincipalToken supply"
                );
            }
        }
    }

    // =========================================================================
    // Invariant 3: Vault USDC balance >= sum of unclaimed funded payouts
    // =========================================================================
    function invariant_vaultUSDCSolvency() public view {
        uint256 count = vault.epochCount();
        uint256 requiredUSDC = 0;

        for (uint256 e = 1; e <= count; ++e) {
            PrismVault.EpochInfo memory info = vault.getEpoch(e);
            if (info.funded && info.fundedSupply > 0) {
                uint256 remainingCoupons = coupon.totalSupply(e);
                requiredUSDC += (remainingCoupons * info.totalFundedUSDC) / info.fundedSupply;
            }
        }

        assertGe(
            usdc.balanceOf(address(vault)),
            requiredUSDC,
            "Invariant 3 Violated: Vault USDC balance < sum of unclaimed funded payouts"
        );
    }

    // =========================================================================
    // Invariant 4: Auction-escrowed coupon balance equals sum of active auctions
    // =========================================================================
    function invariant_auctionEscrowReconciliation() public view {
        uint256 count = vault.epochCount();
        uint256[] memory activeIds = handler.getActiveAuctionIds();

        for (uint256 e = 1; e <= count; ++e) {
            uint256 sumActive = 0;
            for (uint256 i = 0; i < activeIds.length; ++i) {
                PrismAuction.Auction memory a = auction.getAuction(activeIds[i]);
                if (a.active && a.epochId == e) {
                    sumActive += a.amount;
                }
            }

            assertEq(
                coupon.balanceOf(address(auction), e),
                sumActive,
                "Invariant 4 Violated: Escrowed coupon balance != sum of remaining amounts of active auctions"
            );
        }
    }
}
