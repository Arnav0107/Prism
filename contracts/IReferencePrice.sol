// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IReferencePrice
 * @notice Standard interface for stock price oracles providing reference prices for dividend yield calculations.
 */
interface IReferencePrice {
    /**
     * @notice Returns the reference stock price in MockUSDC base units (6 decimals) per 1 whole share (1e18 wei).
     * @return usdcPerShare Price in USDC (6 decimals).
     * @return updatedAt Timestamp of the latest oracle update.
     */
    function price() external view returns (uint256 usdcPerShare, uint256 updatedAt);
}
