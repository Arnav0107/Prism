// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockStock
 * @notice Mock 18-decimal tokenized stock collateral for testing Prism.
 */
contract MockStock is ERC20 {
    constructor() ERC20("Mock Tokenized Stock", "mSTOCK") {}

    /**
     * @notice Public mint function for test environments.
     * @param to Recipient address of newly minted stock.
     * @param amount Amount of stock tokens to mint (18 decimals).
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
