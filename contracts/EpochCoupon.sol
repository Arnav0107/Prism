// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IComplianceHook} from "./IComplianceHook.sol";
import {PrismVault} from "./PrismVault.sol";
import {IDividendSource} from "./IDividendSource.sol";
import {EpochCouponSVG} from "./EpochCouponSVG.sol";

/**
 * @title EpochCoupon
 * @notice ERC1155 multi-token coupon representing dividend entitlement per epoch.
 * @dev Mint and burn capabilities are strictly restricted to the PrismVault.
 *      URI renders dynamic, on-chain SVG artwork and JSON metadata reflecting live epoch status.
 *      Supports optional compliance hook for RWA transfer restrictions (KYC/allowlists).
 */
contract EpochCoupon is ERC1155Supply {
    error OnlyVault();
    error ZeroAddressVault();
    error ComplianceCheckFailed(address from, address to);
    error EpochDoesNotExist(uint256 epochId);

    address public immutable vault;
    address public complianceHook;

    event ComplianceHookUpdated(address indexed hook);

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address _vault, string memory uri_) ERC1155(uri_) {
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
     * @notice Mints epoch coupon tokens (Vault only).
     * @param to Recipient account.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to mint.
     */
    function mint(address to, uint256 epochId, uint256 amount) external onlyVault {
        _mint(to, epochId, amount, "");
    }

    /**
     * @notice Burns epoch coupon tokens (Vault only).
     * @param from Account whose coupons are burned.
     * @param epochId Target epoch ID.
     * @param amount Amount of coupons to burn.
     */
    function burn(address from, uint256 epochId, uint256 amount) external onlyVault {
        _burn(from, epochId, amount);
    }

    /**
     * @dev Enforces compliance hook check on secondary market transfers (bypassed for mint/burn).
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155Supply) {
        if (from != address(0) && to != address(0) && complianceHook != address(0)) {
            uint256 total = ids.length;
            for (uint256 i = 0; i < total; ++i) {
                bool allowed = false;
                try IComplianceHook(complianceHook).verifyTransfer(from, to, values[i]) returns (bool res) {
                    allowed = res;
                } catch {
                    allowed = false;
                }
                if (!allowed) revert ComplianceCheckFailed(from, to);
            }
        }
        super._update(from, to, ids, values);
    }

    function _getPayoutUSDC(PrismVault prismVault, uint256 id, PrismVault.EpochInfo memory epoch) private view returns (uint256) {
        if (epoch.funded) {
            return epoch.fundedSupply > 0 ? (epoch.totalFundedUSDC * 1e18) / epoch.fundedSupply : 0;
        }
        try prismVault.dividendSource().getEvent(id) returns (
            bool declared,
            IDividendSource.ActionType,
            uint256 grossUsdcPerShare,
            uint256 withholdingBps,
            bool
        ) {
            if (declared) {
                return (grossUsdcPerShare * (10000 - withholdingBps)) / 10000;
            }
        } catch {}
        return 0;
    }

    function _getDetails(uint256 id) private view returns (EpochCouponSVG.CouponDetails memory) {
        PrismVault prismVault = PrismVault(vault);
        uint256 count = prismVault.epochCount();
        if (id == 0 || id > count) {
            revert EpochDoesNotExist(id);
        }

        PrismVault.EpochInfo memory epoch = prismVault.getEpoch(id);

        string memory status;
        if (epoch.funded) {
            status = "FUNDED";
        } else if (block.timestamp < epoch.exDate) {
            status = "LIVE";
        } else {
            status = "AWAITING FUNDING";
        }

        uint256 payout = _getPayoutUSDC(prismVault, id, epoch);

        return EpochCouponSVG.CouponDetails({
            epochId: id,
            exDate: epoch.exDate,
            funded: epoch.funded,
            payoutUSDC: payout,
            status: status
        });
    }

    /**
     * @notice Returns fully dynamic, on-chain base64 JSON metadata and SVG image for an epoch coupon.
     * @param id Target epoch identifier.
     */
    function uri(uint256 id) public view override returns (string memory) {
        EpochCouponSVG.CouponDetails memory details = _getDetails(id);
        return EpochCouponSVG.tokenURI(details);
    }
}
