// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReferencePrice} from "./IReferencePrice.sol";

/**
 * @title MockReferencePrice
 * @notice Owner-settable mock reference price oracle for testing implied dividend yields.
 */
contract MockReferencePrice is IReferencePrice, Ownable {
    uint256 private _price;
    uint256 private _updatedAt;

    event PriceUpdated(uint256 usdcPerShare, uint256 updatedAt);

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        _price = initialPrice;
        _updatedAt = block.timestamp;
        emit PriceUpdated(initialPrice, block.timestamp);
    }

    /**
     * @notice Set new reference price with current block timestamp.
     * @param newPrice Price in USDC (6 decimals) per 1 whole share.
     */
    function setPrice(uint256 newPrice) external onlyOwner {
        _price = newPrice;
        _updatedAt = block.timestamp;
        emit PriceUpdated(newPrice, block.timestamp);
    }

    /**
     * @notice Set reference price with an explicit timestamp (for testing staleness).
     * @param newPrice Price in USDC (6 decimals) per 1 whole share.
     * @param timestamp Timestamp to assign as updatedAt.
     */
    function setPriceWithTimestamp(uint256 newPrice, uint256 timestamp) external onlyOwner {
        _price = newPrice;
        _updatedAt = timestamp;
        emit PriceUpdated(newPrice, timestamp);
    }

    /**
     * @notice Returns reference price and timestamp.
     */
    function price() external view returns (uint256 usdcPerShare, uint256 updatedAt) {
        return (_price, _updatedAt);
    }
}
