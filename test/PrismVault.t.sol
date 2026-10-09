// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {MockStock} from "../contracts/MockStock.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";
import {IDividendSource} from "../contracts/IDividendSource.sol";
import {MockDividendSource} from "../contracts/MockDividendSource.sol";
import {PrincipalToken} from "../contracts/PrincipalToken.sol";
import {EpochCoupon} from "../contracts/EpochCoupon.sol";
import {PrismVault} from "../contracts/PrismVault.sol";

contract PrismVaultTest is Test, IERC1155Receiver {
    MockStock internal stock;
    MockUSDC internal usdc;
    MockDividendSource internal dividendSource;
    PrismVault internal vault;
    PrincipalToken internal principal;
    EpochCoupon internal coupon;

    address internal admin = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal funder = makeAddr("funder");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal epoch1Ex;
    uint256 internal epoch1Pay;
    uint256 internal epoch2Ex;
    uint256 internal epoch2Pay;
    uint256 internal epoch3Ex;
    uint256 internal epoch3Pay;

    function setUp() public {
        vm.warp(T0);

        stock = new MockStock();
        usdc = new MockUSDC();
        dividendSource = new MockDividendSource();

        vault = new PrismVault(address(stock), address(usdc), address(dividendSource));
        principal = vault.principalToken();
        coupon = vault.epochCoupon();

        epoch1Ex = T0 + 30 days;
        epoch1Pay = T0 + 35 days;
        epoch2Ex = T0 + 60 days;
        epoch2Pay = T0 + 65 days;
        epoch3Ex = T0 + 90 days;
        epoch3Pay = T0 + 95 days;

        vault.createEpoch(epoch1Ex, epoch1Pay);
        vault.createEpoch(epoch2Ex, epoch2Pay);
        vault.createEpoch(epoch3Ex, epoch3Pay);

        stock.mint(alice, 1_000_000e18);
        stock.mint(bob, 1_000_000e18);
        usdc.mint(funder, 10_000_000e6);

        vm.prank(alice);
        stock.approve(address(vault), type(uint256).max);

        vm.prank(bob);
        stock.approve(address(vault), type(uint256).max);

        vm.prank(funder);
        usdc.approve(address(vault), type(uint256).max);
    }

    // --- IERC1155Receiver implementation ---
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    // --- Unit & Integration Tests ---

    function test_deposit_mintsCorrectLegs() public {
        uint256 depositAmount = 100e18;

        vm.prank(alice);
        vault.deposit(depositAmount);

        // Check Principal Token balance
        assertEq(principal.balanceOf(alice), depositAmount, "Principal balance mismatch");

        // Check Epoch Coupons for all 3 future epochs
        assertEq(coupon.balanceOf(alice, 1), depositAmount, "Coupon 1 mismatch");
        assertEq(coupon.balanceOf(alice, 2), depositAmount, "Coupon 2 mismatch");
        assertEq(coupon.balanceOf(alice, 3), depositAmount, "Coupon 3 mismatch");

        // Check locked collateral in vault
        assertEq(stock.balanceOf(address(vault)), depositAmount, "Vault stock balance mismatch");
    }

    function test_couponSoldToAnotherAddressCanClaim() public {
        uint256 depositAmount = 100e18;
        uint256 transferAmount = 40e18;
        uint256 dividendPerShare = 500_000; // 0.50 USDC per share

        vm.prank(alice);
        vault.deposit(depositAmount);

        // Alice transfers 40 coupons to Bob on the secondary market
        vm.prank(alice);
        coupon.safeTransferFrom(alice, bob, 1, transferAmount, "");

        assertEq(coupon.balanceOf(alice, 1), 60e18);
        assertEq(coupon.balanceOf(bob, 1), 40e18);

        // Dividend declared and epoch funded
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, dividendPerShare);

        vm.prank(funder);
        vault.fundEpoch(1);

        // Bob claims his 40 coupons
        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        vault.claim(1, transferAmount);

        // Expected Bob payout: 40 * 0.50 USDC = 20 USDC (20_000_000)
        assertEq(usdc.balanceOf(bob) - bobUsdcBefore, 20e6, "Bob payout mismatch");
        assertEq(coupon.balanceOf(bob, 1), 0, "Bob coupon balance not burned");

        // Alice claims her remaining 60 coupons
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.claim(1, 60e18);

        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, 30e6, "Alice payout mismatch");
        assertEq(coupon.balanceOf(alice, 1), 0, "Alice coupon balance not burned");
    }

    function test_recombine_beforeExDate() public {
        uint256 depositAmount = 100e18;
        uint256 recombineAmount = 40e18;

        vm.prank(alice);
        vault.deposit(depositAmount);

        uint256 aliceStockBefore = stock.balanceOf(alice);

        // Recombine before any epoch exDate
        vm.prank(alice);
        vault.recombine(recombineAmount);

        assertEq(stock.balanceOf(alice), aliceStockBefore + recombineAmount, "Stock refund mismatch");
        assertEq(principal.balanceOf(alice), depositAmount - recombineAmount, "Principal remaining mismatch");
        assertEq(coupon.balanceOf(alice, 1), depositAmount - recombineAmount, "Coupon 1 mismatch");
        assertEq(coupon.balanceOf(alice, 2), depositAmount - recombineAmount, "Coupon 2 mismatch");
        assertEq(coupon.balanceOf(alice, 3), depositAmount - recombineAmount, "Coupon 3 mismatch");
    }

    function test_recombine_afterExDate() public {
        uint256 depositAmount = 100e18;

        vm.prank(alice);
        vault.deposit(depositAmount);

        // Warp past epoch 1 exDate
        vm.warp(epoch1Ex + 1);

        // Alice sells epoch 1 coupon to Bob
        vm.prank(alice);
        coupon.safeTransferFrom(alice, bob, 1, depositAmount, "");

        assertEq(coupon.balanceOf(alice, 1), 0);

        // Recombine does NOT require epoch 1 coupon anymore
        uint256 aliceStockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.recombine(depositAmount);

        assertEq(stock.balanceOf(alice), aliceStockBefore + depositAmount, "Stock refund mismatch");
        assertEq(principal.balanceOf(alice), 0, "Principal not burned");
        assertEq(coupon.balanceOf(alice, 2), 0, "Coupon 2 not burned");
        assertEq(coupon.balanceOf(alice, 3), 0, "Coupon 3 not burned");

        // Bob still holds epoch 1 coupon
        assertEq(coupon.balanceOf(bob, 1), depositAmount, "Bob still holds coupon 1");
    }

    function test_redeemPrincipal_afterAllEpochsExpire() public {
        uint256 depositAmount = 100e18;

        vm.prank(alice);
        vault.deposit(depositAmount);

        // Attempting redeem before all epochs expire must revert
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PrismVault.FutureEpochsRemain.selector, epoch3Ex, block.timestamp)
        );
        vault.redeemPrincipal(depositAmount);

        // Warp past epoch 3 exDate
        vm.warp(epoch3Ex + 1);

        // Now principal can be redeemed without needing any coupons
        uint256 aliceStockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.redeemPrincipal(depositAmount);

        assertEq(stock.balanceOf(alice), aliceStockBefore + depositAmount, "Stock refund mismatch");
        assertEq(principal.balanceOf(alice), 0, "Principal tokens not burned");
    }

    function test_nonDividendEventRejected() public {
        uint256 depositAmount = 100e18;
        vm.prank(alice);
        vault.deposit(depositAmount);

        // Declare a SPLIT corporate action instead of DIVIDEND
        dividendSource.declareEvent(1, IDividendSource.ActionType.SPLIT, 2e18);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismVault.NonDividendActionType.selector,
                IDividendSource.ActionType.SPLIT
            )
        );
        vault.fundEpoch(1);

        // Declare OTHER corporate action for epoch 2
        dividendSource.declareEvent(2, IDividendSource.ActionType.OTHER, 1e18);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismVault.NonDividendActionType.selector,
                IDividendSource.ActionType.OTHER
            )
        );
        vault.fundEpoch(2);
    }

    function test_fundTwiceReverts() public {
        uint256 depositAmount = 100e18;
        vm.prank(alice);
        vault.deposit(depositAmount);

        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);

        vm.prank(funder);
        vault.fundEpoch(1);

        // Attempting to fund epoch 1 again must revert
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochAlreadyFunded.selector, 1));
        vault.fundEpoch(1);
    }

    function test_claimBeforeFundReverts() public {
        uint256 depositAmount = 100e18;
        vm.prank(alice);
        vault.deposit(depositAmount);

        // Claim before fundEpoch
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.EpochNotFunded.selector, 1));
        vault.claim(1, 50e18);
    }

    function test_fundBeforeDeclareReverts() public {
        uint256 depositAmount = 100e18;
        vm.prank(alice);
        vault.deposit(depositAmount);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PrismVault.DividendNotDeclared.selector, 1));
        vault.fundEpoch(1);
    }

    function test_createEpoch_validations() public {
        // exDate in the past
        vm.expectRevert(PrismVault.ExDateMustBeFuture.selector);
        vault.createEpoch(block.timestamp - 1, block.timestamp + 10);

        // payDate before exDate
        vm.expectRevert(PrismVault.PayDateBeforeExDate.selector);
        vault.createEpoch(block.timestamp + 100 days, block.timestamp + 99 days);

        // exDate not strictly increasing (less than or equal to epoch 3 exDate)
        vm.expectRevert(PrismVault.ExDateNotIncreasing.selector);
        vault.createEpoch(epoch3Ex, epoch3Ex + 10 days);
    }

    // --- Fuzz Invariant Tests ---

    function testFuzz_depositRecombineInvariants(
        uint256 depositAmount,
        uint256 recombineAmount,
        uint256 warpOffset
    ) public {
        depositAmount = bound(depositAmount, 1e18, 100_000e18);
        recombineAmount = bound(recombineAmount, 0, depositAmount);
        warpOffset = bound(warpOffset, 0, 120 days);

        // Mint sufficient stock for alice
        stock.mint(alice, depositAmount);

        vm.prank(alice);
        vault.deposit(depositAmount);

        // Invariant 1: MockStock locked in vault == PrincipalToken total supply
        assertEq(
            stock.balanceOf(address(vault)),
            principal.totalSupply(),
            "Invariant failed: stock locked != principal supply"
        );

        // Warp time
        vm.warp(T0 + warpOffset);

        if (recombineAmount > 0) {
            vm.prank(alice);
            vault.recombine(recombineAmount);

            // Invariant 1 preserved after recombine
            assertEq(
                stock.balanceOf(address(vault)),
                principal.totalSupply(),
                "Invariant failed post-recombine: stock locked != principal supply"
            );
        }

        // Invariant 2: For every epoch, coupon supply == initial deposits minus burned
        for (uint256 i = 1; i <= vault.epochCount(); ++i) {
            PrismVault.EpochInfo memory info = vault.getEpoch(i);
            uint256 currentCouponSupply = coupon.totalSupply(i);

            if (T0 < info.exDate) {
                // Deposit occurred before exDate
                uint256 expectedSupply = depositAmount;
                if (recombineAmount > 0 && (T0 + warpOffset) < info.exDate) {
                    // Recombine burned coupons since it happened before exDate
                    expectedSupply -= recombineAmount;
                }
                assertEq(
                    currentCouponSupply,
                    expectedSupply,
                    "Invariant failed: coupon supply != deposits before exDate minus burned"
                );
            }
        }
    }

    function testFuzz_depositClaimInvariant(
        uint256 depositAlice,
        uint256 depositBob,
        uint256 claimAlice,
        uint256 claimBob,
        uint256 dividendPerShare
    ) public {
        depositAlice = bound(depositAlice, 1e18, 50_000e18);
        depositBob = bound(depositBob, 1e18, 50_000e18);
        claimAlice = bound(claimAlice, 1, depositAlice);
        claimBob = bound(claimBob, 1, depositBob);
        dividendPerShare = bound(dividendPerShare, 1, 100e6);

        stock.mint(alice, depositAlice);
        stock.mint(bob, depositBob);

        vm.prank(alice);
        vault.deposit(depositAlice);

        vm.prank(bob);
        vault.deposit(depositBob);

        // Epoch 1 supply right after deposits
        uint256 initialCoupon1Supply = coupon.totalSupply(1);
        assertEq(initialCoupon1Supply, depositAlice + depositBob);

        // Declare and fund epoch 1
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, dividendPerShare);

        // Mint funder enough USDC
        uint256 neededPayout = (initialCoupon1Supply * dividendPerShare) / 1e18;
        usdc.mint(funder, neededPayout + 1e6);

        vm.prank(funder);
        vault.fundEpoch(1);

        // Alice claims partial or full
        vm.prank(alice);
        vault.claim(1, claimAlice);

        // Bob claims partial or full
        vm.prank(bob);
        vault.claim(1, claimBob);

        // Invariant: coupon supply per epoch == deposits before its exDate minus claimed
        uint256 totalClaimed = claimAlice + claimBob;
        assertEq(
            coupon.totalSupply(1),
            initialCoupon1Supply - totalClaimed,
            "Invariant failed: coupon supply != deposits minus claimed"
        );

        // Invariant: stock locked == principal supply
        assertEq(
            stock.balanceOf(address(vault)),
            principal.totalSupply(),
            "Invariant failed: stock locked != principal supply"
        );
    }

    function test_repro_dilutionAndDrainBug_BobStealsAlicesDividend() public {
        uint256 depositAlice = 100e18;
        uint256 depositBob = 100e18;
        uint256 dividendPerShare = 1e6; // 1 USDC per share

        // 1. Alice deposits 100 stock before exDate
        vm.prank(alice);
        vault.deposit(depositAlice);

        assertEq(coupon.balanceOf(alice, 1), depositAlice);

        // 2. Owner declares dividend and funds epoch 1 while block.timestamp < exDate
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, dividendPerShare);
        vm.prank(funder);
        vault.fundEpoch(1);

        assertEq(usdc.balanceOf(address(vault)), 100e6);

        // 3. Bob deposits 100 stock AFTER epoch 1 was already funded
        vm.prank(bob);
        vault.deposit(depositBob);

        // With _isLive hardening, Bob does NOT receive coupons for funded epoch 1
        assertEq(coupon.balanceOf(bob, 1), 0, "Bob should not receive coupons for funded epoch 1");
        // Bob receives coupons only for unexpired, unfunded epochs (2 and 3)
        assertEq(coupon.balanceOf(bob, 2), depositBob);
        assertEq(coupon.balanceOf(bob, 3), depositBob);

        // 4. Bob cannot claim epoch 1 coupons
        vm.prank(bob);
        vm.expectRevert(PrismVault.InsufficientBalance.selector);
        vault.claim(1, depositBob);

        // 5. Alice claims her 100 coupons successfully and receives her full 100 USDC
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.claim(1, depositAlice);

        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, 100e6, "Alice did not receive full dividend");
        assertEq(coupon.balanceOf(alice, 1), 0);
        assertEq(usdc.balanceOf(address(vault)), 0, "Vault should have 0 USDC left after legitimate claims");
    }

    function test_fundEpoch_beforeExDate_revertsWhenDemoModeFalse() public {
        vault.setDemoMode(false);
        assertFalse(vault.demoMode());

        vm.prank(alice);
        vault.deposit(100e18);

        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);

        // block.timestamp < epoch1Ex reverts when demoMode is false
        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrismVault.ExDateNotReached.selector,
                1,
                epoch1Ex,
                block.timestamp
            )
        );
        vault.fundEpoch(1);

        // Warp to exDate -> now succeeds
        vm.warp(epoch1Ex);
        vm.prank(funder);
        vault.fundEpoch(1);
        (,, bool funded,,) = vault.epochs(1);
        assertTrue(funded);
    }

    function test_recombine_skipsFundedEpochs() public {
        vm.prank(alice);
        vault.deposit(100e18);

        // Declare and fund epoch 1 before exDate
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        vm.prank(funder);
        vault.fundEpoch(1);

        // Alice claims and burns her epoch 1 coupons
        vm.prank(alice);
        vault.claim(1, 100e18);
        assertEq(coupon.balanceOf(alice, 1), 0);

        // Alice can recombine before exDate because epoch 1 is funded and skipped!
        uint256 stockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.recombine(100e18);

        assertEq(stock.balanceOf(alice) - stockBefore, 100e18, "Stock not returned to Alice");
        assertEq(principal.balanceOf(alice), 0);
    }

    function test_hasFutureEpochs_mixedFundedAndUnfunded() public {
        assertTrue(vault.hasFutureEpochs());

        // Fund epoch 1
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, 1e6);
        vm.prank(funder);
        vault.fundEpoch(1);
        assertTrue(vault.hasFutureEpochs(), "Epochs 2 and 3 are still live");

        // Fund epoch 2
        dividendSource.declareEvent(2, IDividendSource.ActionType.DIVIDEND, 1e6);
        vm.prank(funder);
        vault.fundEpoch(2);
        assertTrue(vault.hasFutureEpochs(), "Epoch 3 is still live");

        // Fund epoch 3
        dividendSource.declareEvent(3, IDividendSource.ActionType.DIVIDEND, 1e6);
        vm.prank(funder);
        vault.fundEpoch(3);
        assertFalse(vault.hasFutureEpochs(), "No live epochs should remain");

        // Alice can now redeemPrincipal directly without waiting for exDates
        stock.mint(alice, 50e18);
        vm.prank(alice);
        vault.deposit(50e18);

        assertEq(principal.balanceOf(alice), 50e18);
        assertEq(coupon.balanceOf(alice, 1), 0);

        uint256 stockBefore = stock.balanceOf(alice);
        vm.prank(alice);
        vault.redeemPrincipal(50e18);
        assertEq(stock.balanceOf(alice) - stockBefore, 50e18);
    }

    function testFuzz_vaultUSDCSolvencyAndSupplyInvariant(
        uint256 depositAlice,
        uint256 depositBob,
        uint256 claimAlice,
        uint256 dividendPerShare
    ) public {
        depositAlice = bound(depositAlice, 1e18, 50_000e18);
        depositBob = bound(depositBob, 1e18, 50_000e18);
        claimAlice = bound(claimAlice, 1, depositAlice);
        dividendPerShare = bound(dividendPerShare, 1, 100e6);

        stock.mint(alice, depositAlice);
        stock.mint(bob, depositBob);

        vm.prank(alice);
        vault.deposit(depositAlice);

        // Fund epoch 1
        dividendSource.declareEvent(1, IDividendSource.ActionType.DIVIDEND, dividendPerShare);
        uint256 neededPayout = (coupon.totalSupply(1) * dividendPerShare) / 1e18;
        usdc.mint(funder, neededPayout + 1e6);
        vm.prank(funder);
        vault.fundEpoch(1);

        // Bob deposits after epoch 1 is funded
        vm.prank(bob);
        vault.deposit(depositBob);

        // Alice claims partial or full
        vm.prank(alice);
        vault.claim(1, claimAlice);

        // Invariant 1: for every funded epoch, coupon supply <= fundedSupply
        for (uint256 i = 1; i <= vault.epochCount(); ++i) {
            PrismVault.EpochInfo memory info = vault.getEpoch(i);
            if (info.funded) {
                uint256 remainingCouponSupply = coupon.totalSupply(i);
                assertLe(
                    remainingCouponSupply,
                    info.fundedSupply,
                    "Invariant failed: remaining coupon supply > funded supply"
                );
            }
        }

        // Invariant 2: vault USDC balance >= sum over funded epochs of (remaining coupon supply * totalFundedUSDC / fundedSupply)
        uint256 requiredUSDC = 0;
        for (uint256 i = 1; i <= vault.epochCount(); ++i) {
            PrismVault.EpochInfo memory info = vault.getEpoch(i);
            if (info.funded && info.fundedSupply > 0) {
                uint256 remainingCouponSupply = coupon.totalSupply(i);
                requiredUSDC += (remainingCouponSupply * info.totalFundedUSDC) / info.fundedSupply;
            }
        }
        assertGe(
            usdc.balanceOf(address(vault)),
            requiredUSDC,
            "Solvency Invariant failed: vault USDC balance < required claims"
        );
    }
}



