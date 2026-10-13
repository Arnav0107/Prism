// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IComplianceHook} from "./IComplianceHook.sol";

/**
 * @title EpochCoupon
 * @notice ERC1155 multi-token coupon representing dividend entitlement per epoch.
 * @dev Mint and burn capabilities are strictly restricted to the PrismVault.
 *      URI is initialized empty ("") because EpochCoupons represent financial yield claims
 *      whose lifecycle (funding status, claimable USDC amount, exDate) is queried directly
 *      from PrismVault rather than via static off-chain JSON metadata.
 *      Supports optional compliance hook for RWA transfer restrictions (KYC/allowlists).
 */
contract EpochCoupon is ERC1155Supply {
    error OnlyVault();
    error ZeroAddressVault();
    error ComplianceCheckFailed(address from, address to);

    address public immutable vault;
    address public complianceHook;

    event ComplianceHookUpdated(address indexed hook);

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address _vault, string memory uri_) ERC1155(uri_) {
        if (_vault == address(0)) revert ZeroAddressVault();
        vault = _vault;
    }

    /**
     * @notice Configures compliance hook for transfer verification (Vault only).
     * @param hook Compliance hook address (or address(0) to disable).
     */
    function setComplianceHook(address hook) external onlyVault {
        complianceHook = hook;
        emit ComplianceHookUpdated(hook);
    }

    /**
     * @notice Mints epoch coupon tokens (Vault only).
     * @param to Recipient account.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to mint.
     */
    function mint(address to, uint256 epochId, uint256 amount) external onlyVault {
        _mint(to, epochId, amount, "");
    }

    /**
     * @notice Burns epoch coupon tokens (Vault only).
     * @param from Account whose coupons are burned.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to burn.
     */
    function burn(address from, uint256 epochId, uint256 amount) external onlyVault {
        _burn(from, epochId, amount);
    }

    /**
     * @dev Enforces compliance hook check on secondary market transfers (bypassed for mint/burn).
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155Supply) {
        if (from != address(0) && to != address(0) && complianceHook != address(0)) {
            uint256 total = ids.length;
            for (uint256 i = 0; i < total; ++i) {
                bool allowed = false;
                try IComplianceHook(complianceHook).verifyTransfer(from, to, values[i]) returns (bool res) {
                    allowed = res;
                } catch {
                    allowed = false;
                }
                if (!allowed) revert ComplianceCheckFailed(from, to);
            }
        }
        super._update(from, to, ids, values);
    }
}
