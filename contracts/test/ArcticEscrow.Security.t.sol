// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase}  from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}      from "../ArcticEscrow.sol";
import {MockUSDC}          from "./mocks/MockUSDC.sol";
import {ReentrantAttacker} from "./mocks/ReentrantAttacker.sol";

/// @notice Regression tests for the 2026-10 audit findings (H-1 … L-2).
///         Each test asserts the fixed behaviour.
contract ArcticEscrowSecurityTest is ArcticEscrowBase {

    // ── H-1: payee can no longer trap the payer by delivering at t=0 ─────────

    function test_H1_instantDelivery_payerDisputes_arbiterRefunds() public {
        uint256 id = _approvalDeal(USDC_1K, arbiter);
        _deliver(id, 0); // same block, no real work

        vm.prank(payer);
        escrow.disputeMilestone(id, 0);

        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, false);
        assertEq(usdc.balanceOf(payer), USDC_100K);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_H1_instantDelivery_payeeCannotClaimWhileDisputed() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);

        // No timer lets the payee take disputed funds
        vm.warp(block.timestamp + 3650 days);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_H1_payeeNeverDelivers_payerRefundsAfterDeadline() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(payer);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    // ── H-2: payer can no longer claw back before the delivery deadline ─────

    function test_H2_payerCannotRefundAcceptedMilestoneBeforeDeadline() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.warp(block.timestamp + DELIVER - 1);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);

        // Payee delivers in time and is paid after the review window
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_H2_silentPayerCannotStallPayment() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(payee);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    // ── H-3: accepted Schedule milestones are irrevocable by the payer ──────

    function test_H3_payerCannotRevokeAcceptedSchedule_beforeOrAfterMaturity() public {
        uint64 t = uint64(block.timestamp + 30 days);
        uint256 id = _scheduleDeal(USDC_1K, t);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);

        vm.warp(t + 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);

        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    // ── M-1: payee sees and accepts the splits before any work ───────────────

    function test_M1_unacceptedDealCannotBeDelivered() public {
        // Payer routes the payout to themselves
        uint256 id = _create(_one(_approvalMs(USDC_1K)), _splitTo(payer), address(0));
        assertEq(escrow.getSplits(id)[0].recipient, payer); // visible before accepting

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotAccepted.selector, id));
        escrow.markDelivered(id, 0);
    }

    // ── M-2: failed split payment stays with its recipient ───────────────────

    function test_M2_blockedRecipientIsCreditedNotPayer() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        usdc.setBlocked(payee, true);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.expectEmit(true, false, false, true);
        emit ArcticEscrow.PaymentDeferred(payee, _net(USDC_1K));
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);

        assertEq(usdc.balanceOf(payer), payerBefore); // payer gets nothing back
        assertEq(escrow.owed(payee), _net(USDC_1K));
        assertEq(escrow.liabilities(), _net(USDC_1K));
        _assertSolvent();

        usdc.setBlocked(payee, false);
        vm.prank(payee);
        escrow.withdraw();
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
        assertEq(escrow.owed(payee), 0);
        assertEq(escrow.liabilities(), 0);
    }

    function test_M2_otherSplitsStillPaidWhenOneBlocked() public {
        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](2);
        s[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 5_000});
        s[1] = ArcticEscrow.SplitInput({recipient: bob,   bps: 5_000});
        uint256 id = _create(_one(_approvalMs(USDC_1K)), s, address(0));
        _accept(id);
        _deliver(id, 0);
        usdc.setBlocked(bob, true);

        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        uint256 half = _net(USDC_1K) / 2;
        assertEq(usdc.balanceOf(payee), half);
        assertEq(escrow.owed(bob), _net(USDC_1K) - half);
    }

    function test_M2_blockedTreasuryDoesNotBlockRelease() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        usdc.setBlocked(treasury, true);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
        assertEq(escrow.owed(treasury), uint256(USDC_1K) - _net(USDC_1K));
    }

    // ── M-3: blocklisted payer no longer bricks refunds ──────────────────────

    function test_M3_blockedPayerRefundIsCredited() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        usdc.setBlocked(payer, true);

        vm.prank(payee);
        escrow.refundMilestone(id, 0);
        assertEq(escrow.owed(payer), USDC_1K);
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.Completed));

        // Still blocked: withdraw reverts, funds stay credited
        vm.prank(payer);
        vm.expectRevert();
        escrow.withdraw();
        assertEq(escrow.owed(payer), USDC_1K);
    }

    // ── M-4 / M-5: yield removed; nothing left to freeze or skew ─────────────
    // (No vault code exists in v2. Covered by the absence of the functions.)

    // ── L-1: paginated deal lists ────────────────────────────────────────────

    function test_L1_spamCannotBreakPagedReads() public {
        vm.startPrank(payer);
        usdc.approve(address(escrow), 300);
        for (uint256 i; i < 300; ++i) {
            escrow.createDeal(payee, address(0), "spam", _one(_approvalMs(1)), _splitTo(payer), REVIEW);
        }
        vm.stopPrank();

        assertEq(escrow.dealCountByPayee(payee), 300);
        assertEq(escrow.dealsByPayee(payee, 0, 1_000).length, escrow.MAX_PAGE());
        assertEq(escrow.dealsByPayee(payee, 250, 100).length, 50);
    }

    // ── L-2: bounded deadlines ───────────────────────────────────────────────

    function test_L2_farFutureReleaseRejected() public {
        vm.startPrank(payer);
        usdc.approve(address(escrow), USDC_1K);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.InvalidReleaseTime.selector, 0));
        escrow.createDeal(payee, address(0), "D", _one(_scheduleMs(USDC_1K, type(uint64).max)), _splitTo(payee), REVIEW);
        vm.stopPrank();
    }

    // ── Rescue cannot touch escrowed funds ───────────────────────────────────

    function test_Rescue_OnlyExcessUsdc() public {
        _approvalDeal(USDC_1K, address(0));
        usdc.mint(address(escrow), 5e6); // stray transfer

        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.InsufficientExcess.selector);
        escrow.rescue(address(usdc), owner, 5e6 + 1);

        vm.prank(owner);
        escrow.rescue(address(usdc), owner, 5e6);
        assertEq(usdc.balanceOf(owner), 5e6);
        _assertSolvent();
    }

    function test_Rescue_OtherToken() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(escrow), 42);
        vm.prank(owner);
        escrow.rescue(address(other), owner, 42);
        assertEq(other.balanceOf(owner), 42);
    }

    // ── Reentrancy via a token callback ──────────────────────────────────────

    function test_Reentrancy_ReleaseCannotReenter() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(USDC_1K);
        ms[1] = _approvalMs(USDC_1K);
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);
        _deliver(id, 0);
        _deliver(id, 1);
        vm.warp(block.timestamp + REVIEW);

        ReentrantAttacker attacker = new ReentrantAttacker(address(escrow));
        attacker.arm(abi.encodeCall(ArcticEscrow.releaseMilestone, (id, 1)));
        usdc.setCallback(address(attacker));

        escrow.releaseMilestone(id, 0);
        assertTrue(attacker.attempted());
        assertFalse(attacker.succeeded());
        assertEq(uint8(_state(id, 1)), uint8(ArcticEscrow.MilestoneState.Delivered));
    }

    function test_Reentrancy_WithdrawCannotReenter() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        usdc.setBlocked(payee, true);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        usdc.setBlocked(payee, false);

        ReentrantAttacker attacker = new ReentrantAttacker(address(escrow));
        attacker.arm(abi.encodeCall(ArcticEscrow.withdraw, ()));
        usdc.setCallback(address(attacker));

        vm.prank(payee);
        escrow.withdraw();
        assertFalse(attacker.succeeded());
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    // ── Gas-limited permissionless release cannot move funds elsewhere ───────

    function test_GasGriefing_neverRedirectsFunds() public {
        uint64 t = uint64(block.timestamp + 1 days);
        uint256 id = _scheduleDeal(USDC_1K, t);
        vm.warp(t);

        bytes memory data = abi.encodeCall(ArcticEscrow.releaseMilestone, (id, 0));
        bool released;
        for (uint256 g = 20_000; g <= 400_000; g += 250) {
            vm.prank(stranger);
            (bool ok,) = address(escrow).call{gas: g}(data);
            if (ok) { released = true; break; }
        }
        assertTrue(released, "never released");
        // Paid outright or credited to the payee; never to anyone else
        assertEq(usdc.balanceOf(payee) + escrow.owed(payee), _net(USDC_1K));
        assertEq(usdc.balanceOf(payer), USDC_100K - USDC_1K);
        _assertSolvent();
    }
}
