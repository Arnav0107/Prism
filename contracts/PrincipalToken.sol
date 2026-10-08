// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title PrincipalToken
 * @notice ERC20 token representing price exposure to underlying tokenized stock.
 * @dev Mint and burn capabilities are strictly restricted to the PrismVault.
 */
contract PrincipalToken is ERC20 {
    error OnlyVault();
    error ZeroAddressVault();

    address public immutable vault;

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address _vault) ERC20("Prism Principal Token", "PPT") {
        if (_vault == address(0)) revert ZeroAddressVault();
        vault = _vault;
    }

    /**
     * @notice Mints principal tokens to a recipient (Vault only).
     * @param to Account receiving newly minted principal tokens.
     * @param amount Amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    /**
     * @notice Burns principal tokens from an account (Vault only).
     * @param from Account whose tokens are burned.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
