// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IComplianceHook} from "./IComplianceHook.sol";

/**
 * @title MockAllowlistHook
 * @notice Reference KYC/allowlist compliance hook for testing RWA transfer restrictions.
 */
contract MockAllowlistHook is IComplianceHook, Ownable {
    mapping(address => bool) public isAllowed;

    event AddressAllowlistUpdated(address indexed account, bool allowed);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Updates allowlist status for an account (Owner only).
     * @param account Target address.
     * @param allowed Whether account is allowed to send/receive tokens.
     */
    function setAllowed(address account, bool allowed) external onlyOwner {
        isAllowed[account] = allowed;
        emit AddressAllowlistUpdated(account, allowed);
    }

    /**
     * @notice Batch updates allowlist status for multiple accounts (Owner only).
     * @param accounts Target addresses.
     * @param allowed Whether accounts are allowed.
     */
    function setAllowedBatch(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            isAllowed[accounts[i]] = allowed;
            emit AddressAllowlistUpdated(accounts[i], allowed);
        }
    }

    /**
     * @notice Verifies transfer between sender and recipient. Both must be allowlisted.
     */
    function verifyTransfer(address from, address to, uint256) external view override returns (bool) {
        return isAllowed[from] && isAllowed[to];
    }
}
