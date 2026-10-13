// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title EpochCouponSVG
 * @notice Helper library generating dynamic, on-chain SVG artwork and metadata for EpochCoupons.
 */
library EpochCouponSVG {
    struct CouponDetails {
        uint256 epochId;
        uint256 exDate;
        bool funded;
        uint256 payoutUSDC; // 6 decimals
        string status;      // "LIVE", "AWAITING FUNDING", "FUNDED"
    }

    /**
     * @notice Converts unix timestamp (seconds) into a human-readable "YYYY-MM-DD" date string.
     * @dev Implements Howard Hinnant's civil date algorithm (pure integer math).
     */
    function timestampToDateString(uint256 timestamp) internal pure returns (string memory) {
        uint256 z = timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 d = doy - (153 * mp + 2) / 5 + 1;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) {
            y += 1;
        }

        string memory mStr = m < 10 ? string.concat("0", Strings.toString(m)) : Strings.toString(m);
        string memory dStr = d < 10 ? string.concat("0", Strings.toString(d)) : Strings.toString(d);

        return string.concat(Strings.toString(y), "-", mStr, "-", dStr);
    }

    /**
     * @notice Formats a 6-decimal USDC amount into a human-readable "$X.YY USDC" string.
     */
    function formatUSDC(uint256 amount) internal pure returns (string memory) {
        uint256 whole = amount / 1e6;
        uint256 cents = (amount % 1e6) / 1e4;
        string memory centsStr = cents < 10 ? string.concat("0", Strings.toString(cents)) : Strings.toString(cents);
        return string.concat("$", Strings.toString(whole), ".", centsStr, " USDC");
    }

    function _renderDefs() private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="100%" height="100%">',
            '<defs>',
            '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="#0c0e14"/>',
            '<stop offset="100%" stop-color="#161a24"/>',
            '</linearGradient>',
            '<linearGradient id="prismGrad" x1="0%" y1="0%" x2="100%" y2="0%">',
            '<stop offset="0%" stop-color="#00e5ff"/>',
            '<stop offset="50%" stop-color="#7c3aed"/>',
            '<stop offset="100%" stop-color="#f43f5e"/>',
            '</linearGradient>',
            '</defs>',
            '<rect width="400" height="560" rx="16" fill="url(#bg)" stroke="#232936" stroke-width="2"/>',
            '<line x1="24" y1="70" x2="376" y2="70" stroke="#232936" stroke-width="1"/>',
            '<text x="24" y="44" fill="#64748b" font-family="monospace" font-size="11" font-weight="600" letter-spacing="2">PRISM PROTOCOL // RWA STRIP</text>',
            '<text x="376" y="44" fill="#a1a1aa" font-family="monospace" font-size="11" text-anchor="end">ERC-1155</text>',
            '<rect x="24" y="69" width="80" height="2" fill="url(#prismGrad)"/>'
        );
    }

    function _renderHeader(uint256 epochId, string memory status) private pure returns (string memory) {
        string memory statusBg;
        string memory statusColor;

        if (keccak256(bytes(status)) == keccak256(bytes("FUNDED"))) {
            statusBg = "#063321";
            statusColor = "#10B981";
        } else if (keccak256(bytes(status)) == keccak256(bytes("AWAITING FUNDING"))) {
            statusBg = "#382006";
            statusColor = "#F59E0B";
        } else {
            statusBg = "#0E2A36";
            statusColor = "#00E5FF";
        }

        return string.concat(
            '<text x="24" y="112" fill="#f8fafc" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="700">Epoch Coupon</text>',
            '<text x="24" y="142" fill="url(#prismGrad)" font-family="monospace" font-size="20" font-weight="700">#',
            Strings.toString(epochId),
            '</text>',
            '<rect x="250" y="118" width="126" height="28" rx="14" fill="',
            statusBg,
            '" stroke="',
            statusColor,
            '" stroke-width="1"/>',
            '<circle cx="264" cy="132" r="4" fill="',
            statusColor,
            '"/>',
            '<text x="318" y="136" fill="',
            statusColor,
            '" font-family="monospace" font-size="10" font-weight="700" text-anchor="middle">',
            status,
            '</text>'
        );
    }

    function _renderBody(uint256 exDate, uint256 payoutUSDC) private pure returns (string memory) {
        return string.concat(
            '<g transform="translate(24, 180)">',
            '<rect width="352" height="180" rx="12" fill="#11141d" stroke="#1f2430" stroke-width="1"/>',
            '<text x="20" y="32" fill="#64748b" font-family="monospace" font-size="10" letter-spacing="1">EX-DIVIDEND CUTOFF</text>',
            '<text x="20" y="58" fill="#f1f5f9" font-family="monospace" font-size="16" font-weight="600">',
            timestampToDateString(exDate),
            '</text>',
            '<text x="20" y="76" fill="#475569" font-family="monospace" font-size="10">UNIX: ',
            Strings.toString(exDate),
            '</text>',
            '<line x1="20" y1="96" x2="332" y2="96" stroke="#1f2430" stroke-width="1"/>',
            '<text x="20" y="122" fill="#64748b" font-family="monospace" font-size="10" letter-spacing="1">DISTRIBUTION PAYOUT</text>',
            '<text x="20" y="152" fill="#38bdf8" font-family="monospace" font-size="20" font-weight="700">',
            formatUSDC(payoutUSDC),
            '</text>',
            '</g>'
        );
    }

    function _renderFooter() private pure returns (string memory) {
        return string.concat(
            '<g transform="translate(24, 380)">',
            '<rect width="352" height="110" rx="12" fill="#11141d" stroke="#1f2430" stroke-width="1"/>',
            '<text x="20" y="30" fill="#64748b" font-family="monospace" font-size="10">ASSET RIGHTS</text>',
            '<text x="20" y="48" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="12">Quarterly Cash Dividend Rights</text>',
            '<text x="20" y="78" fill="#64748b" font-family="monospace" font-size="10">UNDERLYING COLLATERAL</text>',
            '<text x="20" y="96" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="12">Tokenized Stock / Principal Split</text>',
            '</g>',
            '<text x="200" y="528" fill="#475569" font-family="monospace" font-size="10" text-anchor="middle" letter-spacing="1">AUTONOMOUS ON-CHAIN METADATA</text>',
            '</svg>'
        );
    }

    /**
     * @notice Renders the raw SVG string for an EpochCoupon.
     */
    function generateSVG(CouponDetails memory details) internal pure returns (string memory) {
        return string.concat(
            _renderDefs(),
            _renderHeader(details.epochId, details.status),
            _renderBody(details.exDate, details.payoutUSDC),
            _renderFooter()
        );
    }

    function _renderAttributes(
        uint256 epochId,
        uint256 exDate,
        string memory status,
        uint256 payoutUSDC
    ) private pure returns (string memory) {
        return string.concat(
            '[{"trait_type":"Epoch","value":',
            Strings.toString(epochId),
            '},{"trait_type":"Ex-Date","value":"',
            timestampToDateString(exDate),
            '"},{"trait_type":"Status","value":"',
            status,
            '"},{"trait_type":"Payout","value":"',
            formatUSDC(payoutUSDC),
            '"}]'
        );
    }

    function _buildJson(CouponDetails memory details, string memory imageUri) private pure returns (string memory) {
        string memory attrs = _renderAttributes(details.epochId, details.exDate, details.status, details.payoutUSDC);
        return string.concat(
            '{"name":"Prism Epoch Coupon #',
            Strings.toString(details.epochId),
            '","description":"On-chain dividend entitlement voucher for Epoch ',
            Strings.toString(details.epochId),
            ' stripped by Prism Protocol. Grants holder pro-rata claim to declared cash dividends.","image":"',
            imageUri,
            '","attributes":',
            attrs,
            '}'
        );
    }

    function _encodeBase64(string memory data) private pure returns (string memory) {
        return Base64.encode(bytes(data));
    }

    /**
     * @notice Generates base64 data URI for an EpochCoupon JSON metadata document.
     */
    function tokenURI(CouponDetails memory details) internal pure returns (string memory) {
        string memory svg = generateSVG(details);
        string memory imageUri = string.concat("data:image/svg+xml;base64,", _encodeBase64(svg));
        string memory json = _buildJson(details, imageUri);
        return string.concat("data:application/json;base64,", _encodeBase64(json));
    }
}
