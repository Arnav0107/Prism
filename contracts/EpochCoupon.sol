// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/**
 * @title EpochCoupon
 * @notice ERC1155 multi-token coupon representing dividend entitlement per epoch.
 * @dev Mint and burn capabilities are strictly restricted to the PrismVault.
 */
contract EpochCoupon is ERC1155Supply {
    error OnlyVault();
    error ZeroAddressVault();

    address public immutable vault;

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address _vault, string memory uri_) ERC1155(uri_) {
        if (_vault == address(0)) revert ZeroAddressVault();
        vault = _vault;
    }

    /**
     * @notice Mints epoch coupon tokens (Vault only).
     * @param to Recipient account.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to mint.
     */
    function mint(
        address to,
        uint256 epochId,
        uint256 amount
    ) external onlyVault {
        _mint(to, epochId, amount, "");
    }

    /**
     * @notice Burns epoch coupon tokens (Vault only).
     * @param from Account whose coupons are burned.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to burn.
     */
    function burn(
        address from,
        uint256 epochId,
        uint256 amount
    ) external onlyVault {
        _burn(from, epochId, amount);
    }
}
