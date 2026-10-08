// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Mock 6-decimal USDC token for dividend distributions.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    /**
     * @notice Returns 6 decimals matching standard USDC.
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Public mint function for test environments.
     * @param to Recipient address of newly minted USDC.
     * @param amount Amount of USDC tokens to mint (6 decimals).
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
