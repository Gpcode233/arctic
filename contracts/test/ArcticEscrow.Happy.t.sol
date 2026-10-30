// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

contract ArcticEscrowHappyTest is ArcticEscrowBase {

    // ── Creation ──────────────────────────────────────────────────────────────

    function test_Create_StoresDeal() public {
        uint256 id = _create(_one(_approvalMs(USDC_1K)), _splitTo(payee), arbiter);
        ArcticEscrow.Deal memory d = escrow.getDeal(id);

        assertEq(id, 0);
        assertEq(d.payer, payer);
        assertEq(d.payee, payee);
        assertEq(d.arbiter, arbiter);
        assertEq(d.total, USDC_1K);
        assertEq(d.reviewPeriod, REVIEW);
        assertEq(d.feeBps, FEE_BPS);
        assertEq(d.acceptedAt, 0);
        assertEq(uint8(d.status), uint8(ArcticEscrow.DealStatus.Funded));
        assertEq(escrow.getDealTitleHash(id), keccak256("Deal"));
        assertEq(escrow.getMilestoneTitleHash(id, 0), keccak256("MS"));
        assertEq(usdc.balanceOf(address(escrow)), USDC_1K);
        assertEq(escrow.liabilities(), USDC_1K);
    }

    function test_Create_EmitsEvent() public {
        vm.startPrank(payer);
        usdc.approve(address(escrow), USDC_1K);
        vm.expectEmit(true, true, true, true);
        emit ArcticEscrow.DealCreated(0, payer, payee, "Deal", USDC_1K, address(0), REVIEW);
        escrow.createDeal(payee, address(0), "Deal", _one(_approvalMs(USDC_1K)), _splitTo(payee), REVIEW);
        vm.stopPrank();
    }

    function test_Create_StoresMilestoneDeadlines() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(100e6);
        ms[0].releaseTime = 123; // ignored for Approval
        ms[1] = _scheduleMs(200e6, uint64(block.timestamp + 10 days));
        ms[1].deliverBy = 456;   // ignored for Schedule
        uint256 id = _create(ms, _splitTo(payee), address(0));

        ArcticEscrow.Milestone[] memory stored = escrow.getMilestones(id);
        assertEq(stored[0].releaseTime, 0);
        assertEq(stored[0].deliverBy, block.timestamp + DELIVER);
        assertEq(stored[1].releaseTime, block.timestamp + 10 days);
        assertEq(stored[1].deliverBy, 0);
    }

    function test_Accept() public {
        uint256 id = _create(_one(_approvalMs(USDC_1K)), _splitTo(payee), address(0));
        vm.expectEmit(true, false, false, false);
        emit ArcticEscrow.DealAccepted(id);
        _accept(id);
        assertEq(escrow.getDeal(id).acceptedAt, block.timestamp);
    }

    // ── Approval flow ─────────────────────────────────────────────────────────

    function test_Approval_PayerReleases() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        assertEq(uint8(_state(id, 0)), uint8(ArcticEscrow.MilestoneState.Delivered));

        vm.prank(payer);
        escrow.releaseMilestone(id, 0);

        uint256 fee = (uint256(USDC_1K) * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(payee), USDC_1K - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.liabilities(), 0);
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(escrow.getDeal(id).released, USDC_1K);
    }

    function test_Approval_AutoReleaseAfterReview_ByAnyone() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW);

        vm.prank(stranger);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Approval_PayeeCanClaimAfterReview() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.warp(block.timestamp + REVIEW);

        vm.prank(payee);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Approval_LateDeliveryStillAllowedIfNotRefunded() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.warp(block.timestamp + DELIVER + 1);
        _deliver(id, 0);
        // Once delivered, the payer can no longer refund unilaterally
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
        escrow.refundMilestone(id, 0);
    }

    // ── Disputes ──────────────────────────────────────────────────────────────

    function test_Dispute_PayeeResubmitsThenPayerReleases() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        assertEq(uint8(_state(id, 0)), uint8(ArcticEscrow.MilestoneState.Disputed));

        vm.warp(block.timestamp + 2 days);
        _deliver(id, 0); // resubmit restarts the review clock
        assertEq(escrow.getMilestones(id)[0].deliveredAt, block.timestamp);

        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Dispute_PayerConcedes() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Dispute_PayeeConcedes() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);

        uint256 before = usdc.balanceOf(payer);
        vm.prank(payee);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer) - before, USDC_1K);
    }

    function test_Dispute_ArbiterReleases() public {
        uint256 id = _approvalDeal(USDC_1K, arbiter);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);

        vm.expectEmit(true, false, false, true);
        emit ArcticEscrow.DisputeResolved(id, 0, true);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, true);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
        assertEq(usdc.balanceOf(arbiter), 0);
    }

    function test_Dispute_ArbiterRefunds() public {
        uint256 id = _approvalDeal(USDC_1K, arbiter);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.disputeMilestone(id, 0);

        uint256 before = usdc.balanceOf(payer);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, false);
        assertEq(usdc.balanceOf(payer) - before, USDC_1K);
        assertEq(usdc.balanceOf(payee), 0);
    }

    // ── Refunds ───────────────────────────────────────────────────────────────

    function test_Refund_PayerBeforeAcceptance() public {
        uint256 id = _create(_one(_approvalMs(USDC_1K)), _splitTo(payee), address(0));
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer) - before, USDC_1K);
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(escrow.getDeal(id).refunded, USDC_1K);
    }

    function test_Refund_PayerScheduleBeforeAcceptance() public {
        uint256 id = _create(_one(_scheduleMs(USDC_1K, uint64(block.timestamp + 1 days))), _splitTo(payee), address(0));
        vm.prank(payer);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    function test_Refund_PayerAfterDeliveryDeadline() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(payer);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    function test_Refund_PayeePending() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.prank(payee);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    function test_Refund_PayeeDelivered() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payee);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    function test_Refund_PayeeSchedule() public {
        uint256 id = _scheduleDeal(USDC_1K, uint64(block.timestamp + 1 days));
        vm.prank(payee);
        escrow.refundMilestone(id, 0);
        assertEq(usdc.balanceOf(payer), USDC_100K);
    }

    // ── Schedule flow ─────────────────────────────────────────────────────────

    function test_Schedule_AnyoneReleasesAtTime() public {
        uint64 t = uint64(block.timestamp + 30 days);
        uint256 id = _scheduleDeal(USDC_1K, t);
        vm.warp(t);
        vm.prank(stranger);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Schedule_VestingTwelveMonths() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](12);
        for (uint256 i; i < 12; ++i) ms[i] = _scheduleMs(100e6, uint64(block.timestamp + (i + 1) * 30 days));
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);

        for (uint256 i; i < 12; ++i) {
            vm.warp(ms[i].releaseTime);
            escrow.releaseMilestone(id, i);
        }
        assertEq(usdc.balanceOf(payee), _net(1_200e6));
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.Completed));
        _assertSolvent();
    }

    // ── Multi milestone / splits ──────────────────────────────────────────────

    function test_MultiMilestone_StatusProgression() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = _approvalMs(400e6);
        ms[1] = _approvalMs(600e6);
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);

        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.InProgress));

        vm.prank(payee);
        escrow.refundMilestone(id, 1);
        assertEq(uint8(_status(id)), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(usdc.balanceOf(payee), _net(400e6));
        assertEq(usdc.balanceOf(payer), USDC_100K - 400e6);
    }

    function test_Splits_ThreeWayWithRemainder() public {
        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](3);
        s[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 3_333});
        s[1] = ArcticEscrow.SplitInput({recipient: alice, bps: 3_333});
        s[2] = ArcticEscrow.SplitInput({recipient: bob,   bps: 3_334});
        uint256 id = _create(_one(_approvalMs(1_000_001)), s, address(0));
        _accept(id);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);

        uint256 net = _net(1_000_001);
        uint256 a = (net * 3_333) / 10_000;
        assertEq(usdc.balanceOf(payee), a);
        assertEq(usdc.balanceOf(alice), USDC_100K + a);
        assertEq(usdc.balanceOf(bob), net - 2 * a);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Splits_EmitSplitPaid() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.expectEmit(true, true, false, true);
        emit ArcticEscrow.SplitPaid(id, 0, payee, uint128(_net(USDC_1K)));
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
    }

    function test_ZeroFee_NoTreasuryTransfer() public {
        vm.prank(owner);
        escrow.setFeeBps(0);
        uint256 id = _approvalDeal(USDC_1K, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), USDC_1K);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    // ── Pagination ────────────────────────────────────────────────────────────

    function test_Pagination() public {
        for (uint256 i; i < 5; ++i) _create(_one(_approvalMs(1e6)), _splitTo(payee), address(0));

        assertEq(escrow.dealCountByPayee(payee), 5);
        assertEq(escrow.dealCountByPayer(payer), 5);

        uint256[] memory page = escrow.dealsByPayee(payee, 1, 3);
        assertEq(page.length, 3);
        assertEq(page[0], 1);
        assertEq(page[2], 3);

        assertEq(escrow.dealsByPayer(payer, 4, 10).length, 1);
        assertEq(escrow.dealsByPayer(payer, 5, 10).length, 0);
        assertEq(escrow.dealsByPayer(payer, 0, type(uint256).max).length, 5);
    }
}
