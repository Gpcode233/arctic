// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

contract ArcticEscrowRevertTest is ArcticEscrowBase {

    function _createExpectRevert(
        address p,
        address arb,
        string memory title,
        ArcticEscrow.MilestoneInput[] memory ms,
        ArcticEscrow.SplitInput[] memory s,
        uint32 review,
        bytes memory err
    ) internal {
        vm.startPrank(payer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.expectRevert(err);
        escrow.createDeal(p, arb, title, ms, s, review);
        vm.stopPrank();
    }

    function _sel(bytes4 s) internal pure returns (bytes memory) { return abi.encodeWithSelector(s); }

    // ── createDeal validation ─────────────────────────────────────────────────

    function test_Create_ZeroPayee() public {
        _createExpectRevert(address(0), address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.ZeroAddress.selector));
    }

    function test_Create_PayeeEqualsPayer() public {
        _createExpectRevert(payer, address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.PayeeEqualsPayer.selector));
    }

    function test_Create_ArbiterIsPayer() public {
        _createExpectRevert(payee, payer, "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidArbiter.selector));
    }

    function test_Create_ArbiterIsPayee() public {
        _createExpectRevert(payee, payee, "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidArbiter.selector));
    }

    function test_Create_ReviewTooShort() public {
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), 1 hours - 1,
            _sel(ArcticEscrow.InvalidReviewPeriod.selector));
    }

    function test_Create_ReviewTooLong() public {
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), 90 days + 1,
            _sel(ArcticEscrow.InvalidReviewPeriod.selector));
    }

    function test_Create_EmptyTitle() public {
        _createExpectRevert(payee, address(0), "", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidTitle.selector));
    }

    function test_Create_TitleTooLong() public {
        string memory t = "123456789012345678901234567890123456789012345678901234567890123456789012345678901";
        _createExpectRevert(payee, address(0), t, _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidTitle.selector));
    }

    function test_Create_EmptyMilestoneTitle() public {
        ArcticEscrow.MilestoneInput memory m = _approvalMs(1e6);
        m.title = "";
        _createExpectRevert(payee, address(0), "D", _one(m), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidTitle.selector));
    }

    function test_Create_NoMilestones() public {
        _createExpectRevert(payee, address(0), "D", new ArcticEscrow.MilestoneInput[](0), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidMilestones.selector));
    }

    function test_Create_TooManyMilestones() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](21);
        for (uint256 i; i < 21; ++i) ms[i] = _approvalMs(1e6);
        _createExpectRevert(payee, address(0), "D", ms, _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidMilestones.selector));
    }

    function test_Create_ZeroAmount() public {
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(0)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidAmount.selector));
    }

    function test_Create_TotalOverflowsUint128() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(type(uint128).max);
        ms[1] = _approvalMs(1);
        _createExpectRevert(payee, address(0), "D", ms, _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.InvalidAmount.selector));
    }

    function test_Create_ScheduleInPast() public {
        _createExpectRevert(payee, address(0), "D", _one(_scheduleMs(1e6, uint64(block.timestamp))), _splitTo(payee), REVIEW,
            abi.encodeWithSelector(ArcticEscrow.InvalidReleaseTime.selector, 0));
    }

    function test_Create_ScheduleBeyondHorizon() public {
        uint64 t = uint64(block.timestamp + 3650 days + 1);
        _createExpectRevert(payee, address(0), "D", _one(_scheduleMs(1e6, t)), _splitTo(payee), REVIEW,
            abi.encodeWithSelector(ArcticEscrow.InvalidReleaseTime.selector, 0));
    }

    function test_Create_DeliverByInPast() public {
        ArcticEscrow.MilestoneInput memory m = _approvalMs(1e6);
        m.deliverBy = uint64(block.timestamp);
        _createExpectRevert(payee, address(0), "D", _one(m), _splitTo(payee), REVIEW,
            abi.encodeWithSelector(ArcticEscrow.InvalidDeadline.selector, 0));
    }

    function test_Create_DeliverByBeyondHorizon() public {
        ArcticEscrow.MilestoneInput memory m = _approvalMs(1e6);
        m.deliverBy = uint64(block.timestamp + 3650 days + 1);
        _createExpectRevert(payee, address(0), "D", _one(m), _splitTo(payee), REVIEW,
            abi.encodeWithSelector(ArcticEscrow.InvalidDeadline.selector, 0));
    }

    function test_Create_NoSplits() public {
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), new ArcticEscrow.SplitInput[](0), REVIEW,
            _sel(ArcticEscrow.InvalidSplits.selector));
    }

    function test_Create_TooManySplits() public {
        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](11);
        for (uint256 i; i < 11; ++i) s[i] = ArcticEscrow.SplitInput({recipient: payee, bps: i == 0 ? 0 : 1_000});
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), s, REVIEW,
            _sel(ArcticEscrow.InvalidSplits.selector));
    }

    function test_Create_SplitZeroRecipient() public {
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), _splitTo(address(0)), REVIEW,
            _sel(ArcticEscrow.InvalidSplits.selector));
    }

    function test_Create_SplitZeroBps() public {
        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](2);
        s[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});
        s[1] = ArcticEscrow.SplitInput({recipient: alice, bps: 0});
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), s, REVIEW,
            _sel(ArcticEscrow.InvalidSplits.selector));
    }

    function test_Create_SplitBpsNot10000() public {
        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](1);
        s[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 9_999});
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), s, REVIEW,
            _sel(ArcticEscrow.InvalidSplits.selector));
    }

    function test_Create_FeeOnTransferRejected() public {
        usdc.setSkimBps(100);
        _createExpectRevert(payee, address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW,
            _sel(ArcticEscrow.FundingMismatch.selector));
    }

    function test_Create_InsufficientAllowance() public {
        vm.prank(payer);
        vm.expectRevert();
        escrow.createDeal(payee, address(0), "D", _one(_approvalMs(1e6)), _splitTo(payee), REVIEW);
    }

    // ── Unknown deal / milestone, completed deal ─────────────────────────────

    function test_DealNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.DealNotFound.selector, 7));
        escrow.releaseMilestone(7, 0);
    }

    function test_MilestoneNotFound() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.MilestoneNotFound.selector, id, 1));
        escrow.markDelivered(id, 1);
    }

    function test_CompletedDealRejectsActions() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payee);
        escrow.refundMilestone(id, 0);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.DealCompleted.selector, id));
        escrow.markDelivered(id, 0);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.DealCompleted.selector, id));
        escrow.releaseMilestone(id, 0);
    }

    // ── acceptDeal ────────────────────────────────────────────────────────────

    function test_Accept_OnlyPayee() public {
        uint256 id = _create(_one(_approvalMs(1e6)), _splitTo(payee), address(0));
        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.NotPayee.selector);
        escrow.acceptDeal(id);
    }

    function test_Accept_Twice() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.AlreadyAccepted.selector, id));
        escrow.acceptDeal(id);
    }

    // ── markDelivered ─────────────────────────────────────────────────────────

    function test_Deliver_RequiresAcceptance() public {
        uint256 id = _create(_one(_approvalMs(1e6)), _splitTo(payee), address(0));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotAccepted.selector, id));
        escrow.markDelivered(id, 0);
    }

    function test_Deliver_OnlyPayee() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.NotPayee.selector);
        escrow.markDelivered(id, 0);
    }

    function test_Deliver_ScheduleMilestone() public {
        uint256 id = _scheduleDeal(1e6, uint64(block.timestamp + 1 days));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDeliverable.selector, id, 0));
        escrow.markDelivered(id, 0);
    }

    function test_Deliver_Twice() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDeliverable.selector, id, 0));
        escrow.markDelivered(id, 0);
    }

    // ── disputeMilestone ──────────────────────────────────────────────────────

    function test_Dispute_OnlyPayer() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(stranger);
        vm.expectRevert(ArcticEscrow.NotPayer.selector);
        escrow.disputeMilestone(id, 0);
    }

    function test_Dispute_NotDelivered() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDisputable.selector, id, 0));
        escrow.disputeMilestone(id, 0);
    }

    function test_Dispute_AfterReviewWindow() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDisputable.selector, id, 0));
        escrow.disputeMilestone(id, 0);
    }

    function test_Dispute_Twice() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDisputable.selector, id, 0));
        escrow.disputeMilestone(id, 0);
    }

    // ── resolveDispute ────────────────────────────────────────────────────────

    function test_Resolve_OnlyArbiter() public {
        uint256 id = _approvalDeal(1e6, arbiter);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.NotArbiter.selector);
        escrow.resolveDispute(id, 0, false);
    }

    function test_Resolve_NoArbiterConfigured() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.prank(address(0));
        vm.expectRevert(ArcticEscrow.NotArbiter.selector);
        escrow.resolveDispute(id, 0, true);
    }

    function test_Resolve_NotDisputed() public {
        uint256 id = _approvalDeal(1e6, arbiter);
        _deliver(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotDisputed.selector, id, 0));
        escrow.resolveDispute(id, 0, true);
    }

    // ── releaseMilestone ──────────────────────────────────────────────────────

    function test_Release_ApprovalNotDelivered() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_StrangerDuringReview() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW - 1);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_DisputedByNonPayer() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.warp(block.timestamp + 365 days);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_ScheduleTooEarly() public {
        uint64 t = uint64(block.timestamp + 1 days);
        uint256 id = _scheduleDeal(1e6, t);
        vm.warp(t - 1);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_ScheduleNotAccepted() public {
        uint64 t = uint64(block.timestamp + 1 days);
        uint256 id = _create(_one(_scheduleMs(1e6, t)), _splitTo(payee), address(0));
        vm.warp(t);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_Twice() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(1e6);
        ms[1] = _approvalMs(1e6);
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
        escrow.releaseMilestone(id, 0);
    }

    // ── refundMilestone ───────────────────────────────────────────────────────

    function test_Refund_Stranger() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.prank(stranger);
        vm.expectRevert(ArcticEscrow.Unauthorized.selector);
        escrow.refundMilestone(id, 0);
    }

    function test_Refund_ArbiterCannotRefundDirectly() public {
        uint256 id = _approvalDeal(1e6, arbiter);
        vm.prank(arbiter);
        vm.expectRevert(ArcticEscrow.Unauthorized.selector);
        escrow.refundMilestone(id, 0);
    }

    function test_Refund_PayerBeforeDeadlineAfterAccept() public {
        uint256 id = _approvalDeal(1e6, address(0));
        vm.warp(block.timestamp + DELIVER); // exactly at deadline is still too early
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);
    }

    function test_Refund_PayerDelivered() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);
    }

    function test_Refund_PayerDisputed() public {
        uint256 id = _approvalDeal(1e6, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);
    }

    function test_Refund_AlreadyReleased() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(1e6);
        ms[1] = _approvalMs(1e6);
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);
    }

    // ── withdraw / rescue ─────────────────────────────────────────────────────

    function test_Withdraw_NothingOwed() public {
        vm.prank(stranger);
        vm.expectRevert(ArcticEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    function test_Rescue_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        escrow.rescue(address(usdc), stranger, 1);
    }

    function test_Rescue_ZeroTo() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        escrow.rescue(address(usdc), address(0), 1);
    }
}
