// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IComplianceHook} from "./IComplianceHook.sol";

/**
 * @title PrincipalToken
 * @notice ERC20 token representing price exposure to underlying tokenized stock.
 * @dev Mint and burn capabilities are strictly restricted to the PrismVault.
 *      Supports optional compliance hook for RWA transfer restrictions (KYC/allowlists).
 */
contract PrincipalToken is ERC20 {
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

    constructor(address _vault) ERC20("Prism Principal Token", "PPT") {
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

    /**
     * @dev Enforces compliance hook check on secondary market transfers (bypassed for mint/burn).
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && complianceHook != address(0)) {
            bool allowed = false;
            try IComplianceHook(complianceHook).verifyTransfer(from, to, value) returns (bool res) {
                allowed = res;
            } catch {
                allowed = false;
            }
            if (!allowed) revert ComplianceCheckFailed(from, to);
        }
        super._update(from, to, value);
    }
}
