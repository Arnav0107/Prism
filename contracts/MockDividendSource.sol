// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDividendSource} from "./IDividendSource.sol";

/**
 * @title MockDividendSource
 * @notice Owner-controlled mock source declaring corporate actions and dividend payouts.
 */
contract MockDividendSource is IDividendSource, Ownable2Step {
    error EventIsLocked(uint256 epochId);
    error EventNotDeclared(uint256 epochId);
    error InvalidEpochId();

    mapping(uint256 => CorporateAction) private _actions;

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Declare or re-declare a corporate action event for a specified epoch (Owner only).
     * @dev Can be called repeatedly until lockEvent(epochId) is executed.
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
        if (_actions[epochId].locked) revert EventIsLocked(epochId);

        _actions[epochId] = CorporateAction({
            declared: true,
            actionType: actionType,
            usdcPerShare: usdcPerShare,
            locked: false
        });

        emit EventDeclared(epochId, actionType, usdcPerShare);
    }

    /**
     * @notice Locks the event declaration permanently, enabling vault funding (Owner only).
     * @param epochId Target epoch identifier.
     */
    function lockEvent(uint256 epochId) external onlyOwner {
        if (epochId == 0) revert InvalidEpochId();
        if (!_actions[epochId].declared) revert EventNotDeclared(epochId);
        if (_actions[epochId].locked) revert EventIsLocked(epochId);

        _actions[epochId].locked = true;
        emit EventLocked(epochId);
    }

    /**
     * @notice Query the corporate action event for an epoch.
     * @param epochId Target epoch identifier.
     * @return declared True if an event has been declared.
     * @return actionType The action type enum.
     * @return usdcPerShare Declared distribution per share in USDC base units (6 decimals) per 1 whole share.
     * @return locked True if the event has been locked.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 usdcPerShare,
            bool locked
        )
    {
        CorporateAction memory action = _actions[epochId];
        return (action.declared, action.actionType, action.usdcPerShare, action.locked);
    }
}
