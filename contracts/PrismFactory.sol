// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrismVault} from "./PrismVault.sol";
import {PrismAuction} from "./PrismAuction.sol";

/**
 * @title PrismFactory
 * @notice Factory and registry for deploying independent Prism stripping series for different tokenized stocks.
 */
contract PrismFactory is Ownable {
    struct SeriesInfo {
        address stock;
        address usdc;
        address dividendSource;
        address vault;
        address principalToken;
        address epochCoupon;
        address auction;
        bool inKindDividends;
        address seriesOwner;
    }

    SeriesInfo[] public series;

    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed stock,
        address vault,
        address principalToken,
        address epochCoupon,
        address auction,
        address seriesOwner
    );

    error ZeroAddress();
    error IndexOutOfBounds();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Returns total number of registered series.
     */
    function seriesCount() external view returns (uint256) {
        return series.length;
    }

    /**
     * @notice Returns series details at specified index.
     * @param index Zero-based series index.
     */
    function seriesAt(uint256 index) external view returns (SeriesInfo memory) {
        if (index >= series.length) revert IndexOutOfBounds();
        return series[index];
    }

    /**
     * @notice Returns all registered series in a single call.
     */
    function allSeries() external view returns (SeriesInfo[] memory) {
        return series;
    }

    /**
     * @notice Deploys a new Prism series (Vault, PrincipalToken, EpochCoupon, PrismAuction).
     * @param stock Underlying collateral token.
     * @param usdc Settlement currency for dividend payouts.
     * @param dividendSource Corporate action oracle / distribution source.
     * @param demoMode Whether to enable demo funding before exDate.
     * @param inKindDividends Whether dividends are distributed as in-kind stock surplus.
     * @param seriesOwner Target owner for the newly deployed vault and auction contracts.
     * @return vault Address of the deployed PrismVault.
     * @return pt Address of the deployed PrincipalToken.
     * @return ec Address of the deployed EpochCoupon.
     * @return auction Address of the deployed PrismAuction.
     */
    function createSeries(
        address stock,
        address usdc,
        address dividendSource,
        bool demoMode,
        bool inKindDividends,
        address seriesOwner
    ) external returns (address vault, address pt, address ec, address auction) {
        if (stock == address(0) || usdc == address(0) || dividendSource == address(0) || seriesOwner == address(0)) {
            revert ZeroAddress();
        }

        PrismVault newVault = new PrismVault(stock, usdc, dividendSource, demoMode, inKindDividends);
        vault = address(newVault);
        pt = address(newVault.principalToken());
        ec = address(newVault.epochCoupon());

        PrismAuction newAuction = new PrismAuction(ec, usdc, vault);
        auction = address(newAuction);

        // Nominate seriesOwner
        newVault.transferOwnership(seriesOwner);
        newAuction.transferOwnership(seriesOwner);

        uint256 seriesId = series.length;
        series.push(
            SeriesInfo({
                stock: stock,
                usdc: usdc,
                dividendSource: dividendSource,
                vault: vault,
                principalToken: pt,
                epochCoupon: ec,
                auction: auction,
                inKindDividends: inKindDividends,
                seriesOwner: seriesOwner
            })
        );

        emit SeriesCreated(seriesId, stock, vault, pt, ec, auction, seriesOwner);
    }
}
