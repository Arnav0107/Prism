// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";
import {EpochCouponSVG} from "../contracts/EpochCouponSVG.sol";

contract EpochCouponMetadataTest is Test {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    EpochCoupon internal coupon;

    address internal alice = makeAddr("alice");
    address internal funder = makeAddr("funder");

    // Epoch dates (Fixed timestamps)
    // 1735689600 = 2025-01-01 00:00:00 UTC
    uint256 internal constant T0 = 1735689600;
    uint256 internal epoch1Ex;
    uint256 internal epoch1Pay;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vault = new PrismVault(address(stock), address(usdc), address(dividendSource), true, false);
        coupon = vault.epochCoupon();

        epoch1Ex = T0 + 90 days; // 2025-04-01
        epoch1Pay = epoch1Ex + 5 days;

        vault.createEpoch(epoch1Ex, epoch1Pay);
        vault.createEpoch(epoch1Ex + 90 days, epoch1Ex + 95 days);
        vault.seal();

        // Mint test stock and deposit 100 shares
        stock.mint(alice, 100e18);
        vm.startPrank(alice);
        stock.approve(address(vault), 100e18);
        vault.deposit(100e18);
        vm.stopPrank();

        // Declare $1.50 dividend for epoch 1
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1_500_000);
        dividendSource.lockEvent(1);
    }

    function test_uri_revertsOnNonexistentEpoch() public {
        vm.expectRevert(abi.encodeWithSelector(EpochCoupon.EpochDoesNotExist.selector, 0));
        coupon.uri(0);

        vm.expectRevert(abi.encodeWithSelector(EpochCoupon.EpochDoesNotExist.selector, 999));
        coupon.uri(999);
    }

    function test_uri_liveEpoch() public view {
        // Warp is at T0, epoch1Ex is T0 + 90 days => Status is LIVE
        string memory uriLive = coupon.uri(1);

        // Assert starts with data:application/json;base64,
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory uriBytes = bytes(uriLive);
        assertGe(uriBytes.length, prefix.length);
        for (uint256 i = 0; i < prefix.length; ++i) {
            assertEq(uriBytes[i], prefix[i], "Mismatch in base64 json prefix");
        }

        // Validate raw SVG generated for LIVE
        EpochCouponSVG.CouponDetails memory details = EpochCouponSVG.CouponDetails({
            epochId: 1,
            exDate: epoch1Ex,
            funded: false,
            payoutUSDC: 1_500_000,
            status: "LIVE"
        });
        string memory svg = EpochCouponSVG.generateSVG(details);

        // Assert SVG contents
        assertTrue(_contains(svg, "Epoch Coupon"), "SVG missing title");
        assertTrue(_contains(svg, "#1"), "SVG missing epoch number");
        assertTrue(_contains(svg, "LIVE"), "SVG missing status badge");
        assertTrue(_contains(svg, "#00E5FF"), "SVG missing LIVE cyan color");
        assertTrue(_contains(svg, "2025-04-01"), "SVG missing human-readable ex-date");
        assertTrue(_contains(svg, "$1.50 USDC"), "SVG missing formatted dividend payout");
    }

    function test_uri_awaitingFundingEpoch() public {
        // Warp past exDate (e.g. epoch1Ex + 1 hour) without funding => Status is AWAITING FUNDING
        vm.warp(epoch1Ex + 3600);

        string memory uriAwaiting = coupon.uri(1);
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory uriBytes = bytes(uriAwaiting);
        assertGe(uriBytes.length, prefix.length);

        EpochCouponSVG.CouponDetails memory details = EpochCouponSVG.CouponDetails({
            epochId: 1,
            exDate: epoch1Ex,
            funded: false,
            payoutUSDC: 1_500_000,
            status: "AWAITING FUNDING"
        });
        string memory svg = EpochCouponSVG.generateSVG(details);

        assertTrue(_contains(svg, "AWAITING FUNDING"), "SVG missing AWAITING FUNDING badge");
        assertTrue(_contains(svg, "#F59E0B"), "SVG missing amber color");
        assertTrue(_contains(svg, "$1.50 USDC"), "SVG missing payout");
    }

    function test_uri_fundedEpoch() public {
        // Fund epoch 1 with $150 USDC (100 shares * $1.50)
        usdc.mint(funder, 150e6);
        vm.startPrank(funder);
        usdc.approve(address(vault), 150e6);
        vault.fundEpoch(1);
        vm.stopPrank();

        string memory uriFunded = coupon.uri(1);
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory uriBytes = bytes(uriFunded);
        assertGe(uriBytes.length, prefix.length);

        EpochCouponSVG.CouponDetails memory details = EpochCouponSVG.CouponDetails({
            epochId: 1,
            exDate: epoch1Ex,
            funded: true,
            payoutUSDC: 1_500_000,
            status: "FUNDED"
        });
        string memory svg = EpochCouponSVG.generateSVG(details);

        assertTrue(_contains(svg, "FUNDED"), "SVG missing FUNDED badge");
        assertTrue(_contains(svg, "#10B981"), "SVG missing emerald color");
        assertTrue(_contains(svg, "$1.50 USDC"), "SVG missing payout amount");
    }

    function test_dump_sample_svg_to_file() public {
        EpochCouponSVG.CouponDetails memory details = EpochCouponSVG.CouponDetails({
            epochId: 1,
            exDate: epoch1Ex,
            funded: true,
            payoutUSDC: 1_500_000,
            status: "FUNDED"
        });
        string memory svg = EpochCouponSVG.generateSVG(details);

        // Dump sample SVG so it can be previewed directly in a web browser
        vm.writeFile("./test/artifacts/coupon_sample.svg", svg);
        assertTrue(bytes(svg).length > 500, "SVG output should be substantial");
    }

    function test_formatting_helpers() public pure {
        // Test civil date conversions
        // 1735689600 = 2025-01-01
        assertEq(EpochCouponSVG.timestampToDateString(1735689600), "2025-01-01");
        // 1743465600 = 2025-04-01
        assertEq(EpochCouponSVG.timestampToDateString(1743465600), "2025-04-01");
        // 1767225600 = 2026-01-01
        assertEq(EpochCouponSVG.timestampToDateString(1767225600), "2026-01-01");

        // Test USDC formatting
        assertEq(EpochCouponSVG.formatUSDC(0), "$0.00 USDC");
        assertEq(EpochCouponSVG.formatUSDC(50_000), "$0.05 USDC");
        assertEq(EpochCouponSVG.formatUSDC(1_500_000), "$1.50 USDC");
        assertEq(EpochCouponSVG.formatUSDC(10_250_000), "$10.25 USDC");
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        if (n.length == 0) return true;

        for (uint256 i = 0; i <= h.length - n.length; ++i) {
            bool found = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
}
