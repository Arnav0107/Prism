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
     * @param amountPerShare Dividend amount per whole share (scaled by 1e18, 6 decimals for USDC).
     */
    function declareEvent(
        uint256 epochId,
        ActionType actionType,
        uint256 amountPerShare
    ) external onlyOwner {
        if (epochId == 0) revert InvalidEpochId();
        if (_actions[epochId].declared) revert EventAlreadyDeclared(epochId);

        _actions[epochId] = CorporateAction({
            declared: true,
            actionType: actionType,
            amountPerShare: amountPerShare
        });

        emit EventDeclared(epochId, actionType, amountPerShare);
    }

    /**
     * @notice Query the corporate action event for an epoch.
     * @param epochId Target epoch identifier.
     * @return declared True if an event has been declared.
     * @return actionType The action type enum.
     * @return amountPerShare Declared distribution per share.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 amountPerShare
        )
    {
        CorporateAction memory action = _actions[epochId];
        return (action.declared, action.actionType, action.amountPerShare);
    }
}
