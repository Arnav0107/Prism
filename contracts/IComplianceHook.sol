// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IComplianceHook
 * @notice Interface for RWA / tokenized asset transfer compliance verification (KYC/allowlist/jurisdiction checks).
 */
interface IComplianceHook {
    /**
     * @notice Verifies if a transfer between two addresses meets compliance requirements.
     * @param from Sender account.
     * @param to Recipient account.
     * @param amount Number of tokens being transferred.
     * @return allowed True if transfer is permitted, false otherwise.
     */
    function verifyTransfer(address from, address to, uint256 amount) external view returns (bool allowed);
}
