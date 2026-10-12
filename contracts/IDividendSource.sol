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
        uint256 usdcPerShare;
        bool locked;
    }

    event EventDeclared(
        uint256 indexed epochId,
        ActionType indexed actionType,
        uint256 usdcPerShare
    );

    event EventLocked(uint256 indexed epochId);

    /**
     * @notice Declare a corporate action event for a specified epoch.
     * @param epochId Target epoch identifier.
     * @param actionType Classification of the corporate action (DIVIDEND, SPLIT, OTHER).
     * @param usdcPerShare Dividend amount in USDC base units (6 decimals) per 1 whole share (1e18 wei).
     */
    function declareEvent(
        uint256 epochId,
        ActionType actionType,
        uint256 usdcPerShare
    ) external;

    /**
     * @notice Locks the corporate action event for a specified epoch, making it immutable.
     * @param epochId Target epoch identifier.
     */
    function lockEvent(uint256 epochId) external;

    /**
     * @notice Query the declared corporate action for an epoch.
     * @param epochId Target epoch identifier.
     * @return declared True if an event has been declared for this epoch.
     * @return actionType The action type classification.
     * @return usdcPerShare The declared distribution amount in USDC base units (6 decimals) per 1 whole share (1e18 wei).
     * @return locked True if the event has been locked and cannot be re-declared.
     */
    function getEvent(uint256 epochId)
        external
        view
        returns (
            bool declared,
            ActionType actionType,
            uint256 usdcPerShare,
            bool locked
        );
}
