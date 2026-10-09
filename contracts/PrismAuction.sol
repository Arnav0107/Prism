// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PrismVault} from "./PrismVault.sol";

/**
 * @title PrismAuction
 * @notice Dutch auction marketplace for trading Prism EpochCoupons.
 *         Sellers escrow coupons and price linearly decays per second from startPrice
 *         to floorPrice, allowing immediate liquidity and price discovery for dividends.
 */
contract PrismAuction is ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Precision scalar matching 1 whole share / coupon (18 decimals).
    uint256 public constant COUPON_PRECISION = 1e18;

    struct Auction {
        address seller;
        uint256 epochId;
        uint256 amount;
        uint256 initialAmount;
        uint256 startPrice;
        uint256 floorPrice;
        uint256 startTime;
        uint256 duration;
        bool active;
    }

    IERC1155 public immutable epochCoupon;
    IERC20 public immutable mockUSDC;
    PrismVault public immutable prismVault;

    uint256 public nextAuctionId = 1;
    mapping(uint256 => Auction) public auctions;

    // Per-epoch market analytics
    mapping(uint256 => uint256) public lastClearingPrice;
    mapping(uint256 => uint256) public epochVolume;
    mapping(uint256 => uint256) public activeAuctionCount;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 indexed epochId,
        uint256 amount,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 duration,
        uint256 startTime
    );

    event Purchase(
        uint256 indexed auctionId,
        address indexed buyer,
        address indexed seller,
        uint256 epochId,
        uint256 amount,
        uint256 price,
        uint256 totalCost
    );

    event AuctionCancelled(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 indexed epochId,
        uint256 refundAmount
    );

    error ZeroAddress();
    error ZeroAmount();
    error InvalidPrice();
    error InvalidDuration();
    error ArrayLengthMismatch();
    error AuctionNotFound(uint256 auctionId);
    error AuctionNotActive(uint256 auctionId);
    error EpochDoesNotExist(uint256 epochId);
    error EpochAlreadyFunded(uint256 epochId);
    error EpochPastExDate(uint256 epochId, uint256 exDate, uint256 currentTimestamp);
    error SlippageExceeded(uint256 currentPrice, uint256 maxPrice);
    error InsufficientAuctionLiquidity(uint256 requested, uint256 available);
    error OnlySeller();

    constructor(
        address epochCoupon_,
        address mockUSDC_,
        address prismVault_
    ) {
        if (epochCoupon_ == address(0) || mockUSDC_ == address(0) || prismVault_ == address(0)) {
            revert ZeroAddress();
        }
        epochCoupon = IERC1155(epochCoupon_);
        mockUSDC = IERC20(mockUSDC_);
        prismVault = PrismVault(prismVault_);
    }

    /**
     * @notice Creates a single Dutch auction, escrowing EpochCoupons from the seller.
     * @param epochId Target epoch identifier.
     * @param amount Amount of coupons to escrow and sell.
     * @param startPrice Starting price in MockUSDC base units per 1e18 coupons.
     * @param floorPrice Minimum reserve price in MockUSDC base units per 1e18 coupons.
     * @param duration Duration in seconds over which the price linearly decays.
     * @return auctionId Unique auction identifier.
     */
    function createAuction(
        uint256 epochId,
        uint256 amount,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 duration
    ) external nonReentrant returns (uint256 auctionId) {
        auctionId = _createAuction(epochId, amount, startPrice, floorPrice, duration);
    }

    /**
     * @notice Creates multiple Dutch auctions in a single transaction (e.g. "sell next 4 dividends").
     * @param epochIds Array of target epoch identifiers.
     * @param amounts Array of coupon amounts to escrow per epoch.
     * @param startPrices Array of starting prices per epoch.
     * @param floorPrices Array of floor prices per epoch.
     * @param duration Duration in seconds for all created auctions.
     * @return auctionIds Array of assigned auction identifiers.
     */
    function createBatchAuctions(
        uint256[] calldata epochIds,
        uint256[] calldata amounts,
        uint256[] calldata startPrices,
        uint256[] calldata floorPrices,
        uint256 duration
    ) external nonReentrant returns (uint256[] memory auctionIds) {
        uint256 total = epochIds.length;
        if (
            total != amounts.length ||
            total != startPrices.length ||
            total != floorPrices.length
        ) {
            revert ArrayLengthMismatch();
        }

        auctionIds = new uint256[](total);
        for (uint256 i = 0; i < total; ++i) {
            auctionIds[i] = _createAuction(
                epochIds[i],
                amounts[i],
                startPrices[i],
                floorPrices[i],
                duration
            );
        }
    }

    /**
     * @notice Computes deterministic current price of an auction with linear per-second decay.
     * @param auctionId Target auction identifier.
     * @return price Current price in MockUSDC base units per 1e18 coupons.
     */
    function currentPrice(uint256 auctionId) public view returns (uint256 price) {
        Auction storage auction = auctions[auctionId];
        if (auction.startTime == 0) revert AuctionNotFound(auctionId);

        if (block.timestamp <= auction.startTime) {
            return auction.startPrice;
        }

        uint256 elapsed = block.timestamp - auction.startTime;
        if (elapsed >= auction.duration) {
            return auction.floorPrice;
        }

        uint256 priceDiff = auction.startPrice - auction.floorPrice;
        uint256 decay = (priceDiff * elapsed) / auction.duration;
        return auction.startPrice - decay;
    }

    /**
     * @notice Purchases coupon tokens from an active auction at the live decaying price.
     * @param auctionId Target auction identifier.
     * @param amount Amount of coupons to buy (partial fills supported).
     * @param maxPrice Maximum acceptable price per 1e18 coupons (slippage guard).
     */
    function buy(
        uint256 auctionId,
        uint256 amount,
        uint256 maxPrice
    ) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive(auctionId);
        if (amount == 0) revert ZeroAmount();
        if (amount > auction.amount) {
            revert InsufficientAuctionLiquidity(amount, auction.amount);
        }

        uint256 price = currentPrice(auctionId);
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 totalCost = (amount * price) / COUPON_PRECISION;

        auction.amount -= amount;
        lastClearingPrice[auction.epochId] = price;
        epochVolume[auction.epochId] += amount;

        if (auction.amount == 0) {
            auction.active = false;
            activeAuctionCount[auction.epochId]--;
        }

        if (totalCost > 0) {
            mockUSDC.safeTransferFrom(msg.sender, auction.seller, totalCost);
        }

        epochCoupon.safeTransferFrom(address(this), msg.sender, auction.epochId, amount, "");

        emit Purchase(
            auctionId,
            msg.sender,
            auction.seller,
            auction.epochId,
            amount,
            price,
            totalCost
        );
    }

    /**
     * @notice Cancels an active auction and returns remaining escrowed coupons to the seller.
     * @param auctionId Target auction identifier.
     */
    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive(auctionId);
        if (msg.sender != auction.seller) revert OnlySeller();

        auction.active = false;
        uint256 refundAmount = auction.amount;
        auction.amount = 0;
        activeAuctionCount[auction.epochId]--;

        epochCoupon.safeTransferFrom(address(this), auction.seller, auction.epochId, refundAmount, "");

        emit AuctionCancelled(auctionId, auction.seller, auction.epochId, refundAmount);
    }

    /**
     * @notice Exposes market depth and pricing metrics for a given epoch.
     * @param epochId Target epoch identifier.
     * @return clearingPrice Latest clearing price for this epoch.
     * @return volume Cumulative coupons purchased.
     * @return activeCount Number of active auctions currently open.
     */
    function getEpochMarketData(uint256 epochId)
        external
        view
        returns (
            uint256 clearingPrice,
            uint256 volume,
            uint256 activeCount
        )
    {
        return (lastClearingPrice[epochId], epochVolume[epochId], activeAuctionCount[epochId]);
    }

    /**
     * @notice Returns auction configuration and state.
     * @param auctionId Target auction identifier.
     */
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    // --- Internal Helpers ---

    function _createAuction(
        uint256 epochId,
        uint256 amount,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 duration
    ) internal returns (uint256 auctionId) {
        if (amount == 0) revert ZeroAmount();
        if (startPrice < floorPrice || floorPrice == 0) revert InvalidPrice();
        if (duration == 0) revert InvalidDuration();

        if (epochId == 0 || epochId > prismVault.epochCount()) {
            revert EpochDoesNotExist(epochId);
        }

        PrismVault.EpochInfo memory epoch = prismVault.getEpoch(epochId);
        if (epoch.funded) revert EpochAlreadyFunded(epochId);
        if (block.timestamp >= epoch.exDate) {
            revert EpochPastExDate(epochId, epoch.exDate, block.timestamp);
        }

        epochCoupon.safeTransferFrom(msg.sender, address(this), epochId, amount, "");

        auctionId = nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            epochId: epochId,
            amount: amount,
            initialAmount: amount,
            startPrice: startPrice,
            floorPrice: floorPrice,
            startTime: block.timestamp,
            duration: duration,
            active: true
        });

        activeAuctionCount[epochId]++;

        emit AuctionCreated(
            auctionId,
            msg.sender,
            epochId,
            amount,
            startPrice,
            floorPrice,
            duration,
            block.timestamp
        );
    }
}
