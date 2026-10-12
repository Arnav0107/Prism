// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDividendSource} from "./IDividendSource.sol";

/**
 * @title MockDividendSource
 * @notice Owner-controlled mock source declaring corporate actions and dividend payouts.
 */
contract MockDividendSource is IDividendSource, Ownable {
    error EventAlreadyDeclared(uint256 epochId);
    error InvalidEpochId();

    mapping(uint256 => CorporateAction) private _actions;

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Declare a corporate action event for a specified epoch (Owner only).
     * @param epochId Target epoch identifier.
     * @param actionType Classification of corporate action.
     * @param usdcPerShare Dividend amount in USDC base units (6 decimals) per 1 whole share (1e18 wei).
     */
    function declareEvent(
        uint256 epochId,
        ActionType actionType,
        uint256 usdcPerShare
    ) external onlyOwner {
        if (epochId == 0) revert InvalidEpochId();
        if (_actions[epochId].declared) revert EventAlreadyDeclared(epochId);

        _actions[epochId] = CorporateAction({
            declared: true,
            actionType: actionType,
            usdcPerShare: usdcPerShare
        });

        emit EventDeclared(epochId, actionType, usdcPerShare);
    }

    /**
     * @notice Query the corporate action event for an epoch.
     * @param epochId Target epoch identifier.
     * @return declared True if an event has been declared.
     * @return actionType The action type enum.
     * @return usdcPerShare Declared distribution per share in USDC base units (6 decimals) per 1 whole share.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 usdcPerShare
        )
    {
        CorporateAction memory action = _actions[epochId];
        return (action.declared, action.actionType, action.usdcPerShare);
    }
}
