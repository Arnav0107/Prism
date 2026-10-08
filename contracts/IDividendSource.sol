// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDividendSource
 * @notice Interface for declaring and querying corporate action events per epoch.
 */
interface IDividendSource {
    enum ActionType {
        DIVIDEND,
        SPLIT,
        OTHER
    }

    struct CorporateAction {
        bool declared;
        ActionType actionType;
        uint256 amountPerShare;
    }

    event EventDeclared(
        uint256 indexed epochId,
        ActionType indexed actionType,
        uint256 amountPerShare
    );

    /**
     * @notice Declare a corporate action event for a specified epoch.
     * @param epochId Target epoch identifier.
     * @param actionType Classification of the corporate action (DIVIDEND, SPLIT, OTHER).
     * @param amountPerShare Dividend amount per 1 whole share (scaled by 1e18, MockUSDC decimals).
     */
    function declareEvent(
        uint256 epochId,
        ActionType actionType,
        uint256 amountPerShare
    ) external;

    /**
     * @notice Query the declared corporate action for an epoch.
     * @param epochId Target epoch identifier.
     * @return declared True if an event has been declared for this epoch.
     * @return actionType The action type classification.
     * @return amountPerShare The declared distribution amount per share.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 amountPerShare
        );
}
