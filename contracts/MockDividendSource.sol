// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDividendSource} from "./IDividendSource.sol";

/**
 * @title MockDividendSource
 * @notice Owner-controlled mock source declaring corporate actions and dividend payouts with tax withholding.
 */
contract MockDividendSource is IDividendSource, Ownable2Step {
    error EventIsLocked(uint256 epochId);
    error EventNotDeclared(uint256 epochId);
    error InvalidEpochId();
    error InvalidWithholdingBps(uint256 bps);

    mapping(uint256 => CorporateAction) private _actions;

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Declare or re-declare a corporate action event with withholding tax for an epoch (Owner only).
     * @dev Can be called repeatedly until lockEvent(epochId) is executed.
     * @param epochId Target epoch identifier.
     * @param actionType Classification of corporate action.
     * @param usdcPerShare Gross dividend amount in USDC base units (6 decimals) per 1 whole share (1e18 wei).
     * @param withholdingBps Withholding tax rate in basis points (0 to 10000).
     */
    function declareEvent(uint256 epochId, ActionType actionType, uint256 usdcPerShare, uint256 withholdingBps)
        public
        onlyOwner
    {
        if (epochId == 0) revert InvalidEpochId();
        if (withholdingBps > 10000) revert InvalidWithholdingBps(withholdingBps);
        if (_actions[epochId].locked) revert EventIsLocked(epochId);

        _actions[epochId] = CorporateAction({
            declared: true,
            actionType: actionType,
            usdcPerShare: usdcPerShare,
            withholdingBps: withholdingBps,
            locked: false
        });

        emit EventDeclared(epochId, actionType, usdcPerShare, withholdingBps);
    }

    /**
     * @notice Overload for declaring event with 0% withholding tax.
     */
    function declareEvent(uint256 epochId, ActionType actionType, uint256 usdcPerShare) external onlyOwner {
        declareEvent(epochId, actionType, usdcPerShare, 0);
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
     * @return usdcPerShare Gross distribution per share in USDC base units (6 decimals) per 1 whole share.
     * @return withholdingBps Withholding tax in basis points (0 to 10000).
     * @return locked True if the event has been locked.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 usdcPerShare,
            uint256 withholdingBps,
            bool locked
        )
    {
        CorporateAction memory action = _actions[epochId];
        return (action.declared, action.actionType, action.usdcPerShare, action.withholdingBps, action.locked);
    }

    /**
     * @notice Computes net dividend per share after tax withholding.
     * @param epochId Target epoch identifier.
     * @return netUsdcPerShare Net dividend per share in USDC base units.
     */
    function getNetPayout(uint256 epochId) external view returns (uint256 netUsdcPerShare) {
        CorporateAction memory action = _actions[epochId];
        return (action.usdcPerShare * (10000 - action.withholdingBps)) / 10000;
    }
}
