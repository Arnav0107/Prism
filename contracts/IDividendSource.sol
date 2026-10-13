// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDividendSource
 * @notice Interface for declaring and querying corporate action events per epoch, including net-of-withholding tax handling.
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
        uint256 usdcPerShare; // Gross dividend per share in USDC base units (6 decimals) per 1 whole share (1e18)
        uint256 withholdingBps; // Tax withholding in basis points (0 to 10000, e.g. 3000 = 30%)
        bool locked;
    }

    event EventDeclared(
        uint256 indexed epochId, ActionType indexed actionType, uint256 usdcPerShare, uint256 withholdingBps
    );

    event EventLocked(uint256 indexed epochId);

    /**
     * @notice Declare a corporate action event for a specified epoch with withholding tax.
     * @param epochId Target epoch identifier.
     * @param actionType Classification of the corporate action (DIVIDEND, SPLIT, OTHER).
     * @param usdcPerShare Gross dividend amount in USDC base units (6 decimals) per 1 whole share (1e18 wei).
     * @param withholdingBps Withholding tax rate in basis points (0 to 10000).
     */
    function declareEvent(uint256 epochId, ActionType actionType, uint256 usdcPerShare, uint256 withholdingBps)
        external;

    /**
     * @notice Overload for declaring corporate action with default 0% withholding tax.
     */
    function declareEvent(uint256 epochId, ActionType actionType, uint256 usdcPerShare) external;

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
     * @return usdcPerShare The gross distribution amount in USDC base units per 1 whole share.
     * @return withholdingBps Withholding tax in basis points (0 - 10000).
     * @return locked True if the event has been locked and cannot be re-declared.
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
        );
}
