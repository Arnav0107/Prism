// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {PrincipalToken} from "./PrincipalToken.sol";
import {EpochCoupon} from "./EpochCoupon.sol";
import {IDividendSource} from "./IDividendSource.sol";

/**
 * @title PrismVault
 * @notice Splits tokenized stock collateral into Principal Tokens (capital exposure)
 *         and per-epoch Epoch Coupons (dividend distribution exposure).
 */
contract PrismVault is Ownable2Step, Pausable, ReentrancyGuard {
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

    /// @notice Maximum number of distribution epochs permitted.
    uint256 public constant MAX_EPOCHS = 16;
    /// @notice Maximum horizon into the future for an epoch exDate (400 days).
    uint256 public constant MAX_EPOCH_HORIZON = 400 days;
    /// @notice Grace period during which unfunded past-exDate epochs block principal exit.
    uint256 public constant FUNDING_GRACE = 30 days;

    /// @notice Demo mode flag allowing early funding before exDate for live demonstrations.
    bool public demoMode;

    /// @notice Sealing flag indicating the epoch distribution schedule is locked. Fixed before first deposit.
    bool public isSealed;

    uint256 public epochCount;
    mapping(uint256 => EpochInfo) public epochs;
    mapping(uint256 => bool) public epochDefaulted;

    address public guardian;
    address public pendingGuardian;

    event EpochCreated(uint256 indexed epochId, uint256 exDate, uint256 payDate);
    event Deposited(address indexed user, uint256 amount);
    event EpochFunded(uint256 indexed epochId, address indexed funder, uint256 payout, uint256 couponSupply);
    event CouponClaimed(uint256 indexed epochId, address indexed claimer, uint256 amount, uint256 payout);
    event Recombined(address indexed user, uint256 amount);
    event PrincipalRedeemed(address indexed user, uint256 amount);
    event DemoModeSet(bool enabled);
    event VaultSealed();
    event FundingGraceActive(uint256 indexed epochId, uint256 graceEndsAt);
    event FundingDefaulted(uint256 indexed epochId);
    event GuardianTransferStarted(address indexed previousGuardian, address indexed newGuardian);
    event GuardianTransferred(address indexed previousGuardian, address indexed newGuardian);

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
    error ExDateNotReached(uint256 epochId, uint256 exDate, uint256 currentTimestamp);
    error EpochsSealed();
    error MaxEpochsReached();
    error EpochHorizonExceeded(uint256 exDate, uint256 maxExDate);
    error CannotEnableDemoMode();
    error UnsupportedCollateral();
    error EventNotLocked(uint256 epochId);
    error EpochAwaitingFunding(uint256 epochId, uint256 graceEndsAt);
    error NoEpochs();
    error CollateralShortfall();
    error NotGuardian();
    error NotPendingGuardian();

    constructor(address stock_, address usdc_, address dividendSource_, bool demoMode_) Ownable(msg.sender) {
        if (stock_ == address(0) || usdc_ == address(0) || dividendSource_ == address(0)) {
            revert ZeroAddress();
        }
        mockStock = IERC20(stock_);
        mockUSDC = IERC20(usdc_);
        dividendSource = IDividendSource(dividendSource_);
        demoMode = demoMode_;

        principalToken = new PrincipalToken(address(this));
        epochCoupon = new EpochCoupon(address(this), "");
    }

    /**
     * @notice Disable demo mode (Owner only). In production or once turned off,
     *         demoMode cannot be re-enabled.
     * @param enabled Must be false. Reverts if true.
     */
    function setDemoMode(bool enabled) external onlyOwner {
        if (enabled) revert CannotEnableDemoMode();
        demoMode = false;
        emit DemoModeSet(false);
    }

    /**
     * @notice Seals the vault epoch schedule permanently (Owner only).
     */
    function seal() external onlyOwner {
        if (epochCount == 0) revert NoEpochs();
        isSealed = true;
        emit VaultSealed();
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
     * @notice Pause deposits (Guardian or Owner). Exit actions (recombine, redeem, claim) remain open.
     */
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _pause();
    }

    /**
     * @notice Unpause deposits (Guardian or Owner).
     */
    function unpause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _unpause();
    }

    /**
     * @notice Registers a new distribution epoch (Owner only).
     * @dev Reverts if vault is already sealed (post-deposit or manual seal).
     *      Epoch schedule is fixed before the first deposit.
     * @param exDate Ex-dividend cutoff timestamp (must be strictly in future, <= MAX_EPOCH_HORIZON, and increasing).
     * @param payDate Expected payout timestamp (must be >= exDate).
     */
    function createEpoch(uint256 exDate, uint256 payDate) external onlyOwner {
        if (isSealed) revert EpochsSealed();
        if (epochCount >= MAX_EPOCHS) revert MaxEpochsReached();
        if (exDate <= block.timestamp) revert ExDateMustBeFuture();
        if (exDate > block.timestamp + MAX_EPOCH_HORIZON) {
            revert EpochHorizonExceeded(exDate, block.timestamp + MAX_EPOCH_HORIZON);
        }
        if (payDate < exDate) revert PayDateBeforeExDate();
        if (epochCount > 0 && exDate <= epochs[epochCount].exDate) revert ExDateNotIncreasing();

        uint256 newEpochId = ++epochCount;
        epochs[newEpochId] =
            EpochInfo({exDate: exDate, payDate: payDate, funded: false, totalFundedUSDC: 0, fundedSupply: 0});

        emit EpochCreated(newEpochId, exDate, payDate);
    }

    /**
     * @notice Splits collateral stock into PrincipalToken and EpochCoupons for live epochs.
     * @dev Seals the vault epoch schedule on first deposit if not already sealed.
     *      Measures actual received balance to reject fee-on-transfer or rebasing tokens.
     *      Can be paused by guardian/owner without impacting user exits.
     * @param amount Amount of underlying stock to deposit.
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (mockStock.balanceOf(address(this)) < principalToken.totalSupply()) {
            revert CollateralShortfall();
        }

        if (!isSealed) {
            if (epochCount == 0) revert NoEpochs();
            isSealed = true;
            emit VaultSealed();
        }

        uint256 balanceBefore = mockStock.balanceOf(address(this));
        mockStock.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = mockStock.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert UnsupportedCollateral();

        principalToken.mint(msg.sender, amount);

        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (_isLive(i)) {
                epochCoupon.mint(msg.sender, i, amount);
            }
        }

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Funds an epoch with declared dividend payouts in USDC, marking it CLAIMABLE.
     * @dev Corporate action event must be finalized and locked by the dividend source.
     *      Never pausable.
     * @param epochId Target epoch identifier.
     */
    function fundEpoch(uint256 epochId) external nonReentrant {
        if (epochId == 0 || epochId > epochCount) revert EpochDoesNotExist(epochId);

        EpochInfo storage epoch = epochs[epochId];
        if (epoch.funded) revert EpochAlreadyFunded(epochId);

        if (!demoMode && block.timestamp < epoch.exDate) {
            revert ExDateNotReached(epochId, epoch.exDate, block.timestamp);
        }

        (bool declared, IDividendSource.ActionType actionType, uint256 usdcPerShare, bool locked) =
            dividendSource.getEvent(epochId);

        if (!declared) revert DividendNotDeclared(epochId);
        if (!locked) revert EventNotLocked(epochId);
        if (actionType != IDividendSource.ActionType.DIVIDEND) revert NonDividendActionType(actionType);

        uint256 currentSupply = epochCoupon.totalSupply(epochId);
        uint256 requiredUSDC = (currentSupply * usdcPerShare) / SHARE_PRECISION;

        epoch.funded = true;
        epoch.totalFundedUSDC = requiredUSDC;
        epoch.fundedSupply = currentSupply;

        if (requiredUSDC > 0) {
            mockUSDC.safeTransferFrom(msg.sender, address(this), requiredUSDC);
        }

        emit EpochFunded(epochId, msg.sender, requiredUSDC, currentSupply);
    }

    /**
     * @notice Claims dividend distribution payouts for a funded epoch by burning EpochCoupons.
     * @dev Never pausable.
     * @param epochId Target epoch identifier.
     * @param amount Amount of EpochCoupon vouchers to redeem for USDC.
     */
    function claim(uint256 epochId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (epochId == 0 || epochId > epochCount) revert EpochDoesNotExist(epochId);

        EpochInfo storage epoch = epochs[epochId];
        if (!epoch.funded) revert EpochNotFunded(epochId);
        if (epochCoupon.balanceOf(msg.sender, epochId) < amount) revert InsufficientBalance();

        uint256 payout = (amount * epoch.totalFundedUSDC) / epoch.fundedSupply;

        epochCoupon.burn(msg.sender, epochId, amount);

        if (payout > 0) {
            mockUSDC.safeTransfer(msg.sender, payout);
        }

        emit CouponClaimed(epochId, msg.sender, amount, payout);
    }

    /**
     * @notice Recombines 1 PT + 1 EC for all remaining live epochs to unlock 1 underlying share.
     * @dev Blocked if any past-exDate epoch is unfunded and within the 30-day FUNDING_GRACE period.
     *      Epochs already funded or past exDate (post-grace) are skipped.
     *      Never pausable — user exit path is always open.
     * @param amount Amount of stock to reconstitute.
     */
    function recombine(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (mockStock.balanceOf(address(this)) < principalToken.totalSupply()) {
            revert CollateralShortfall();
        }
        if (principalToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();

        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (_isAwaitingFunding(i)) {
                revert EpochAwaitingFunding(i, epochs[i].exDate + FUNDING_GRACE);
            }
            if (!epochs[i].funded && block.timestamp >= epochs[i].exDate + FUNDING_GRACE) {
                if (!epochDefaulted[i]) {
                    epochDefaulted[i] = true;
                    emit FundingDefaulted(i);
                }
            }
        }

        for (uint256 i = 1; i <= total; ++i) {
            if (_isLive(i)) {
                if (epochCoupon.balanceOf(msg.sender, i) < amount) revert InsufficientBalance();
                epochCoupon.burn(msg.sender, i, amount);
            }
        }

        principalToken.burn(msg.sender, amount);
        mockStock.safeTransfer(msg.sender, amount);

        emit Recombined(msg.sender, amount);
    }

    /**
     * @notice Redeems stock collateral using PrincipalToken when no live future epochs remain.
     * @dev Blocked if any past-exDate epoch is unfunded and within the 30-day FUNDING_GRACE period.
     *      Never pausable — user exit path is always open.
     * @param amount Amount of principal to redeem.
     */
    function redeemPrincipal(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (mockStock.balanceOf(address(this)) < principalToken.totalSupply()) {
            revert CollateralShortfall();
        }

        (bool hasLive, uint256 latestLiveExDate) = _getLiveStatus();
        if (hasLive) revert FutureEpochsRemain(latestLiveExDate, block.timestamp);

        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (_isAwaitingFunding(i)) {
                revert EpochAwaitingFunding(i, epochs[i].exDate + FUNDING_GRACE);
            }
            if (!epochs[i].funded && block.timestamp >= epochs[i].exDate + FUNDING_GRACE) {
                if (!epochDefaulted[i]) {
                    epochDefaulted[i] = true;
                    emit FundingDefaulted(i);
                }
            }
        }

        if (principalToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();

        principalToken.burn(msg.sender, amount);
        mockStock.safeTransfer(msg.sender, amount);

        emit PrincipalRedeemed(msg.sender, amount);
    }

    /**
     * @notice Checks whether any live (unfunded and unexpired) epochs exist in the vault.
     */
    function hasFutureEpochs() public view returns (bool) {
        (bool hasLive,) = _getLiveStatus();
        return hasLive;
    }

    /**
     * @notice Returns live status, awaiting funding status, defaulted status, and grace expiry timestamp for an epoch.
     * @param epochId Target epoch identifier.
     * @return live True if epoch is unfunded and before exDate.
     * @return awaitingFunding True if epoch is unfunded, past exDate, and within FUNDING_GRACE.
     * @return defaulted True if epoch is unfunded and past exDate + FUNDING_GRACE.
     * @return graceEndsAt Timestamp at which the funding grace period expires.
     */
    function fundingStatus(uint256 epochId)
        external
        view
        returns (bool live, bool awaitingFunding, bool defaulted, uint256 graceEndsAt)
    {
        if (epochId == 0 || epochId > epochCount) {
            revert EpochDoesNotExist(epochId);
        }
        EpochInfo storage epoch = epochs[epochId];
        graceEndsAt = epoch.exDate + FUNDING_GRACE;
        live = !epoch.funded && block.timestamp < epoch.exDate;
        awaitingFunding = !epoch.funded && block.timestamp >= epoch.exDate && block.timestamp < graceEndsAt;
        defaulted = !epoch.funded && block.timestamp >= graceEndsAt;
    }

    /**
     * @notice Returns epoch metadata and funding state.
     * @param epochId Target epoch identifier.
     */
    function getEpoch(uint256 epochId) external view returns (EpochInfo memory) {
        return epochs[epochId];
    }

    /**
     * @notice Internal helper checking if an epoch is live (unfunded and before exDate).
     * @param epochId Target epoch identifier.
     */
    function _isLive(uint256 epochId) internal view returns (bool) {
        return !epochs[epochId].funded && epochs[epochId].exDate > block.timestamp;
    }

    /**
     * @notice Internal helper checking if an epoch is awaiting dividend funding within grace.
     * @param epochId Target epoch identifier.
     */
    function _isAwaitingFunding(uint256 epochId) internal view returns (bool) {
        EpochInfo storage ep = epochs[epochId];
        return !ep.funded && block.timestamp >= ep.exDate && block.timestamp < ep.exDate + FUNDING_GRACE;
    }

    /**
     * @notice Internal helper returning whether any live epochs exist and the latest live exDate.
     */
    function _getLiveStatus() internal view returns (bool hasLive, uint256 latestExDate) {
        uint256 total = epochCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (_isLive(i)) {
                hasLive = true;
                if (epochs[i].exDate > latestExDate) {
                    latestExDate = epochs[i].exDate;
                }
            }
        }
    }
}
