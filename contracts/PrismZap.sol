// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PrismVault} from "./PrismVault.sol";
import {PrismAuction} from "./PrismAuction.sol";
import {PrincipalToken} from "./PrincipalToken.sol";
import {EpochCoupon} from "./EpochCoupon.sol";

/**
 * @title PrismZap
 * @notice One-click convenience contract for depositing stock collateral, receiving Principal Tokens,
 *         and immediately listing dividend coupons into Dutch auctions on the user's behalf.
 */
contract PrismZap is ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error ArrayLengthMismatch();

    event Zapped(
        address indexed user,
        address indexed vault,
        address indexed auction,
        uint256 amount,
        uint256[] auctionIds
    );

    /**
     * @notice Deposits stock collateral, forwards PT to user, and lists coupons in Dutch auctions.
     * @param vault Target PrismVault.
     * @param auction Target PrismAuction.
     * @param amount Amount of underlying stock collateral to deposit.
     * @param epochIds Epoch IDs to list coupons for.
     * @param startPrices Starting price per epoch auction.
     * @param floorPrices Floor price per epoch auction.
     * @param duration Duration for created auctions.
     * @return auctionIds Array of created auction IDs.
     */
    function depositAndListCoupons(
        address vault,
        address auction,
        uint256 amount,
        uint256[] calldata epochIds,
        uint256[] calldata startPrices,
        uint256[] calldata floorPrices,
        uint256 duration
    ) external nonReentrant returns (uint256[] memory auctionIds) {
        if (vault == address(0) || auction == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // 1. Pull stock from user and deposit into vault
        PrismVault(vault).mockStock().safeTransferFrom(msg.sender, address(this), amount);
        PrismVault(vault).mockStock().forceApprove(vault, amount);
        PrismVault(vault).deposit(amount);

        // 2. Forward minted PrincipalToken to user
        PrincipalToken pt = PrismVault(vault).principalToken();
        pt.transfer(msg.sender, pt.balanceOf(address(this)));

        // 3. Create Dutch auctions with user as the seller
        PrismVault(vault).epochCoupon().setApprovalForAll(auction, true);
        uint256[] memory amounts = new uint256[](epochIds.length);
        for (uint256 i = 0; i < epochIds.length; ++i) {
            amounts[i] = amount;
        }

        auctionIds = PrismAuction(auction).createBatchAuctionsFor(
            msg.sender,
            epochIds,
            amounts,
            startPrices,
            floorPrices,
            duration
        );

        emit Zapped(msg.sender, vault, auction, amount, auctionIds);
    }
}
