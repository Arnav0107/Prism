// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PrismVault} from "./PrismVault.sol";
import {IDividendSource} from "./IDividendSource.sol";
import {IReferencePrice} from "./IReferencePrice.sol";

/**
 * @title PrismAuction
 * @notice Dutch auction marketplace for trading Prism EpochCoupons.
 *         Sellers escrow coupons and price linearly decays per second from startPrice
 *         to floorPrice, allowing immediate liquidity and price discovery for dividends.
 */
contract PrismAuction is ERC1155Holder, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Precision scalar matching 1 whole share / coupon (18 decimals).
    uint256 public constant COUPON_PRECISION = 1e18;
    /// @notice Minimum fill size (0.001 coupon) unless taking full auction remainder.
    uint256 public constant MIN_FILL = 1e15;
    /// @notice Maximum allowed auction duration (30 days).
    uint256 public constant MAX_AUCTION_DURATION = 30 days;

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

    // Per-epoch market analytics (volume-weighted average price tracking - informational only)
    mapping(uint256 => uint256) public epochNotional;
    mapping(uint256 => uint256) public epochVolume;
    mapping(uint256 => uint256) public activeAuctionCount;

    address public guardian;
    address public pendingGuardian;

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
        uint256 indexed auctionId, address indexed seller, uint256 indexed epochId, uint256 refundAmount
    );

    event GuardianTransferStarted(address indexed previousGuardian, address indexed newGuardian);
    event GuardianTransferred(address indexed previousGuardian, address indexed newGuardian);

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
    error FillBelowMinimum(uint256 amount, uint256 minFill);
    error DividendNotLocked(uint256 epochId);
    error SelfTrade();
    error AuctionExtendsPastExDate(uint256 auctionEndTime, uint256 exDate);
    error NotGuardian();
    error NotPendingGuardian();
    error InvalidReferencePrice();
    error StaleReferencePrice(uint256 updatedAt, uint256 currentTimestamp);

    constructor(address epochCoupon_, address mockUSDC_, address prismVault_) Ownable(msg.sender) {
        if (epochCoupon_ == address(0) || mockUSDC_ == address(0) || prismVault_ == address(0)) {
            revert ZeroAddress();
        }
        epochCoupon = IERC1155(epochCoupon_);
        mockUSDC = IERC20(mockUSDC_);
        prismVault = PrismVault(prismVault_);
    }

    /**
     * @notice Starts 2-step guardian transfer (Owner only).
     * @param newGuardian Nominated guardian address.
     */
    function transferGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        pendingGuardian = newGuardian;
        emit GuardianTransferStarted(guardian, newGuardian);
    }

    /**
     * @notice Accepts guardian role (Pending guardian only).
     */
    function acceptGuardian() external {
        if (msg.sender != pendingGuardian) revert NotPendingGuardian();
        emit GuardianTransferred(guardian, pendingGuardian);
        guardian = pendingGuardian;
        pendingGuardian = address(0);
    }

    /**
     * @notice Pause auction creation and purchases (Guardian or Owner). Cancel remains open.
     */
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _pause();
    }

    /**
     * @notice Unpause auction actions (Guardian or Owner).
     */
    function unpause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _unpause();
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
    function createAuction(uint256 epochId, uint256 amount, uint256 startPrice, uint256 floorPrice, uint256 duration)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 auctionId)
    {
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
    ) external nonReentrant whenNotPaused returns (uint256[] memory auctionIds) {
        uint256 total = epochIds.length;
        if (total != amounts.length || total != startPrices.length || total != floorPrices.length) {
            revert ArrayLengthMismatch();
        }

        auctionIds = new uint256[](total);
        for (uint256 i = 0; i < total; ++i) {
            auctionIds[i] = _createAuction(epochIds[i], amounts[i], startPrices[i], floorPrices[i], duration);
        }
    }

    /**
     * @notice Creates multiple Dutch auctions on behalf of a specific seller address (e.g. via PrismZap).
     * @dev Escrows coupons from msg.sender, but sets seller and payout destination to `seller`.
     * @param seller Beneficiary address that owns the auctions and receives purchase proceeds.
     * @param epochIds Array of target epoch identifiers.
     * @param amounts Array of coupon amounts to escrow per epoch.
     * @param startPrices Array of starting prices per epoch.
     * @param floorPrices Array of floor prices per epoch.
     * @param duration Duration in seconds for all created auctions.
     * @return auctionIds Array of assigned auction identifiers.
     */
    function createBatchAuctionsFor(
        address seller,
        uint256[] calldata epochIds,
        uint256[] calldata amounts,
        uint256[] calldata startPrices,
        uint256[] calldata floorPrices,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256[] memory auctionIds) {
        if (seller == address(0)) revert ZeroAddress();
        uint256 total = epochIds.length;
        if (total != amounts.length || total != startPrices.length || total != floorPrices.length) {
            revert ArrayLengthMismatch();
        }

        auctionIds = new uint256[](total);
        for (uint256 i = 0; i < total; ++i) {
            auctionIds[i] = _createAuctionFor(seller, epochIds[i], amounts[i], startPrices[i], floorPrices[i], duration);
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
     * @dev Blocks self-trading and changeable dividends. Pausable by guardian.
     * @param auctionId Target auction identifier.
     * @param amount Amount of coupons to buy (partial fills supported).
     * @param maxPrice Maximum acceptable price per 1e18 coupons (slippage guard).
     */
    function buy(uint256 auctionId, uint256 amount, uint256 maxPrice) external nonReentrant whenNotPaused {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive(auctionId);
        if (msg.sender == auction.seller) revert SelfTrade();
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_FILL && amount != auction.amount) {
            revert FillBelowMinimum(amount, MIN_FILL);
        }
        if (amount > auction.amount) {
            revert InsufficientAuctionLiquidity(amount, auction.amount);
        }

        PrismVault.EpochInfo memory epoch = prismVault.getEpoch(auction.epochId);
        if (epoch.funded) revert EpochAlreadyFunded(auction.epochId);
        if (block.timestamp >= epoch.exDate) {
            revert EpochPastExDate(auction.epochId, epoch.exDate, block.timestamp);
        }

        (bool declared,,,, bool locked) = prismVault.dividendSource().getEvent(auction.epochId);
        if (!declared || !locked) {
            revert DividendNotLocked(auction.epochId);
        }

        uint256 price = currentPrice(auctionId);
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 totalCost = Math.mulDiv(amount, price, COUPON_PRECISION, Math.Rounding.Ceil);

        auction.amount -= amount;
        epochNotional[auction.epochId] += totalCost;
        epochVolume[auction.epochId] += amount;

        if (auction.amount == 0) {
            auction.active = false;
            activeAuctionCount[auction.epochId]--;
        }

        if (totalCost > 0) {
            mockUSDC.safeTransferFrom(msg.sender, auction.seller, totalCost);
        }

        epochCoupon.safeTransferFrom(address(this), msg.sender, auction.epochId, amount, "");

        emit Purchase(auctionId, msg.sender, auction.seller, auction.epochId, amount, price, totalCost);
    }

    /**
     * @notice Cancels an active auction and returns remaining escrowed coupons to the seller.
     * @dev Never pausable — sellers can always withdraw their inventory.
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
     * @notice Computes volume-weighted average price (VWAP) for an epoch.
     * @dev VWAP is strictly informational and does not represent an unmanipulable on-chain oracle.
     * @param epochId Target epoch identifier.
     * @return vwapPrice Volume-weighted clearing price in MockUSDC base units per 1e18 coupons.
     */
    function vwap(uint256 epochId) public view returns (uint256 vwapPrice) {
        uint256 vol = epochVolume[epochId];
        if (vol == 0) return 0;
        return Math.mulDiv(epochNotional[epochId], COUPON_PRECISION, vol);
    }

    /**
     * @notice Backward-compatible view returning VWAP for an epoch.
     * @param epochId Target epoch identifier.
     */
    function lastClearingPrice(uint256 epochId) external view returns (uint256) {
        return vwap(epochId);
    }

    /**
     * @notice Exposes market depth and pricing metrics for a given epoch.
     * @param epochId Target epoch identifier.
     * @return clearingPrice Volume-weighted average price (VWAP) for this epoch.
     * @return volume Cumulative coupons purchased.
     * @return activeCount Number of active auctions currently open.
     */
    function getEpochMarketData(uint256 epochId)
        external
        view
        returns (uint256 clearingPrice, uint256 volume, uint256 activeCount)
    {
        return (vwap(epochId), epochVolume[epochId], activeAuctionCount[epochId]);
    }

    /**
     * @notice Returns auction configuration and state.
     * @param auctionId Target auction identifier.
     */
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    // --- Internal Helpers ---

    function _createAuction(uint256 epochId, uint256 amount, uint256 startPrice, uint256 floorPrice, uint256 duration)
        internal
        returns (uint256 auctionId)
    {
        return _createAuctionFor(msg.sender, epochId, amount, startPrice, floorPrice, duration);
    }

    function _createAuctionFor(
        address seller,
        uint256 epochId,
        uint256 amount,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 duration
    ) internal returns (uint256 auctionId) {
        if (amount == 0) revert ZeroAmount();
        if (startPrice < floorPrice || floorPrice == 0 || startPrice > type(uint128).max) revert InvalidPrice();
        if (duration == 0 || duration > MAX_AUCTION_DURATION) revert InvalidDuration();

        if (epochId == 0 || epochId > prismVault.epochCount()) {
            revert EpochDoesNotExist(epochId);
        }

        PrismVault.EpochInfo memory epoch = prismVault.getEpoch(epochId);
        if (epoch.funded) revert EpochAlreadyFunded(epochId);
        if (block.timestamp >= epoch.exDate) {
            revert EpochPastExDate(epochId, epoch.exDate, block.timestamp);
        }
        if (block.timestamp + duration > epoch.exDate) {
            revert AuctionExtendsPastExDate(block.timestamp + duration, epoch.exDate);
        }

        (bool declared,,,, bool locked) = prismVault.dividendSource().getEvent(epochId);
        if (!declared || !locked) {
            revert DividendNotLocked(epochId);
        }

        auctionId = nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: seller,
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

        epochCoupon.safeTransferFrom(msg.sender, address(this), epochId, amount, "");

        emit AuctionCreated(auctionId, seller, epochId, amount, startPrice, floorPrice, duration, block.timestamp);
    }

    /**
     * @notice Computes implied quarterly dividend yield in basis points using an on-chain reference stock price.
     * @dev Yield (bps) = (VWAP * 10,000) / referenceStockPrice.
     *      Reverts if referencePrice is zero, returns zero price, or is older than 1 day.
     * @param epochId Target epoch identifier.
     * @param referencePrice Address of contract implementing IReferencePrice.
     * @return yieldBps Implied quarterly yield in basis points (100 bps = 1.00%).
     */
    function impliedQuarterlyYieldBps(uint256 epochId, address referencePrice)
        external
        view
        returns (uint256 yieldBps)
    {
        if (referencePrice == address(0)) revert InvalidReferencePrice();
        (uint256 refPrice, uint256 updatedAt) = IReferencePrice(referencePrice).price();
        if (refPrice == 0) revert InvalidReferencePrice();
        if (block.timestamp > updatedAt + 1 days) {
            revert StaleReferencePrice(updatedAt, block.timestamp);
        }

        uint256 currentVwap = vwap(epochId);
        yieldBps = (currentVwap * 10_000) / refPrice;
    }
}
