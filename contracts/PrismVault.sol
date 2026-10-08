// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {PrincipalToken} from "./PrincipalToken.sol";
import {EpochCoupon} from "./EpochCoupon.sol";
import {IDividendSource} from "./IDividendSource.sol";

/**
 * @title PrismVault
 * @notice Splits tokenized stock collateral into Principal Tokens (capital exposure)
 *         and per-epoch Epoch Coupons (dividend distribution exposure).
 */
contract PrismVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Precision scaler for dividend amounts per whole share (18 decimals).
    uint256 public constant SHARE_PRECISION = 1e18;

    struct EpochInfo {
        uint256 exDate;
        uint256 payDate;
        bool funded;
        uint256 totalFundedUSDC;
        uint256 fundedSupply;
    }

    IERC20 public immutable mockStock;
    IERC20 public immutable mockUSDC;
    IDividendSource public immutable dividendSource;
    PrincipalToken public immutable principalToken;
    EpochCoupon public immutable epochCoupon;

    uint256 public epochCount;
    mapping(uint256 => EpochInfo) public epochs;

    event EpochCreated(uint256 indexed epochId, uint256 exDate, uint256 payDate);
    event Deposited(address indexed user, uint256 amount);
    event EpochFunded(uint256 indexed epochId, address indexed funder, uint256 payout, uint256 couponSupply);
    event CouponClaimed(uint256 indexed epochId, address indexed claimer, uint256 amount, uint256 payout);
    event Recombined(address indexed user, uint256 amount);
    event PrincipalRedeemed(address indexed user, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error ExDateMustBeFuture();
    error PayDateBeforeExDate();
    error ExDateNotIncreasing();
    error EpochDoesNotExist(uint256 epochId);
    error EpochAlreadyFunded(uint256 epochId);
    error EpochNotFunded(uint256 epochId);
    error DividendNotDeclared(uint256 epochId);
    error NonDividendActionType(IDividendSource.ActionType actionType);
    error InsufficientBalance();
    error FutureEpochsRemain(uint256 latestExDate, uint256 currentTimestamp);

    constructor(
        address stock_,
        address usdc_,
        address dividendSource_
    ) Ownable(msg.sender) {
        if (stock_ == address(0) || usdc_ == address(0) || dividendSource_ == address(0)) {
            revert ZeroAddress();
        }
        mockStock = IERC20(stock_);
        mockUSDC = IERC20(usdc_);
        dividendSource = IDividendSource(dividendSource_);

        principalToken = new PrincipalToken(address(this));
        epochCoupon = new EpochCoupon(address(this), "https://prism.finance/api/epoch/{id}.json");
    }

    /**
     * @notice Registers a new distribution epoch (Owner only).
     * @param exDate Ex-dividend cutoff timestamp (must be strictly in future and increasing).
     * @param payDate Expected payout timestamp (must be >= exDate).
     */
    function createEpoch(uint256 exDate, uint256 payDate) external onlyOwner {
        if (exDate <= block.timestamp) revert ExDateMustBeFuture();
        if (payDate < exDate) revert PayDateBeforeExDate();
        if (epochCount > 0 && exDate <= epochs[epochCount].exDate) revert ExDateNotIncreasing();

        uint256 newEpochId = ++epochCount;
        epochs[newEpochId] = EpochInfo({
            exDate: exDate,
            payDate: payDate,
            funded: false,
            totalFundedUSDC: 0,
            fundedSupply: 0
        });

        emit EpochCreated(newEpochId, exDate, payDate);
    }

    /**
     * @notice Splits collateral stock into PrincipalToken and EpochCoupons for unexpired epochs.
     * @param amount Amount of underlying stock to deposit.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        mockStock.safeTransferFrom(msg.sender, address(this), amount);
        principalToken.mint(msg.sender, amount);

        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (epochs[i].exDate > block.timestamp) {
                epochCoupon.mint(msg.sender, i, amount);
            }
        }

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Funds an epoch with declared dividend payouts in USDC, marking it CLAIMABLE.
     * @param epochId Target epoch identifier.
     */
    function fundEpoch(uint256 epochId) external nonReentrant {
        if (epochId == 0 || epochId > epochCount) revert EpochDoesNotExist(epochId);

        EpochInfo storage epoch = epochs[epochId];
        if (epoch.funded) revert EpochAlreadyFunded(epochId);

        (bool declared, IDividendSource.ActionType actionType, uint256 amountPerShare) =
            dividendSource.getEvent(epochId);

        if (!declared) revert DividendNotDeclared(epochId);
        if (actionType != IDividendSource.ActionType.DIVIDEND) revert NonDividendActionType(actionType);

        uint256 currentSupply = epochCoupon.totalSupply(epochId);
        uint256 payout = (currentSupply * amountPerShare) / SHARE_PRECISION;

        epoch.funded = true;
        epoch.fundedSupply = currentSupply;
        epoch.totalFundedUSDC = payout;

        if (payout > 0) {
            mockUSDC.safeTransferFrom(msg.sender, address(this), payout);
        }

        emit EpochFunded(epochId, msg.sender, payout, currentSupply);
    }

    /**
     * @notice Claims dividend distribution by burning EpochCoupons for a funded epoch.
     * @param epochId Target epoch identifier.
     * @param amount Amount of coupon tokens to burn for claim.
     */
    function claim(uint256 epochId, uint256 amount) external nonReentrant {
        if (epochId == 0 || epochId > epochCount) revert EpochDoesNotExist(epochId);
        if (amount == 0) revert ZeroAmount();

        EpochInfo storage epoch = epochs[epochId];
        if (!epoch.funded) revert EpochNotFunded(epochId);

        if (epochCoupon.balanceOf(msg.sender, epochId) < amount) revert InsufficientBalance();

        uint256 payout = 0;
        if (epoch.fundedSupply > 0) {
            payout = (amount * epoch.totalFundedUSDC) / epoch.fundedSupply;
        }

        epochCoupon.burn(msg.sender, epochId, amount);

        if (payout > 0) {
            mockUSDC.safeTransfer(msg.sender, payout);
        }

        emit CouponClaimed(epochId, msg.sender, amount, payout);
    }

    /**
     * @notice Recombines PrincipalToken and unexpired EpochCoupons to retrieve collateral stock.
     * @dev Epochs whose exDate has already passed are not required.
     * @param amount Amount of stock to reconstitute.
     */
    function recombine(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (principalToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();

        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (epochs[i].exDate > block.timestamp) {
                if (epochCoupon.balanceOf(msg.sender, i) < amount) revert InsufficientBalance();
                epochCoupon.burn(msg.sender, i, amount);
            }
        }

        principalToken.burn(msg.sender, amount);
        mockStock.safeTransfer(msg.sender, amount);

        emit Recombined(msg.sender, amount);
    }

    /**
     * @notice Redeems stock collateral using PrincipalToken when no future epochs remain.
     * @param amount Amount of principal to redeem.
     */
    function redeemPrincipal(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (hasFutureEpochs()) revert FutureEpochsRemain(epochs[epochCount].exDate, block.timestamp);
        if (principalToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();

        principalToken.burn(msg.sender, amount);
        mockStock.safeTransfer(msg.sender, amount);

        emit PrincipalRedeemed(msg.sender, amount);
    }

    /**
     * @notice Checks whether any unexpired epochs exist in the vault.
     */
    function hasFutureEpochs() public view returns (bool) {
        if (epochCount == 0) return false;
        return epochs[epochCount].exDate > block.timestamp;
    }

    /**
     * @notice Returns epoch metadata and funding state.
     * @param epochId Target epoch identifier.
     */
    function getEpoch(uint256 epochId) external view returns (EpochInfo memory) {
        return epochs[epochId];
    }
}
