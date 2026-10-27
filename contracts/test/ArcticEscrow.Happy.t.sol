// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

/// @dev Happy-path tests: Approval rule, Schedule rule, splits, fee math,
///      refundMilestone, dealsByPayer/Payee, pendingYield (no yield).
contract ArcticEscrowHappyTest is ArcticEscrowBase {

    // ── createDeal ─────────────────────────────────────────────────────────────

    function test_CreateDeal_IncrementsDealCount() public {
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        assertEq(escrowNoVault.dealCount(), 1);
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        assertEq(escrowNoVault.dealCount(), 2);
    }

    function test_CreateDeal_PullsUSDCFromPayer() public {
        uint256 before = usdc.balanceOf(payer);
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        assertEq(usdc.balanceOf(payer), before - USDC_1K);
        assertEq(usdc.balanceOf(address(escrowNoVault)), USDC_1K);
    }

    function test_CreateDeal_EmitsDealCreated() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(escrowNoVault), USDC_1K);
        vm.expectEmit(true, true, true, true, address(escrowNoVault));
        emit ArcticEscrow.DealCreated(0, payer, payee, "Deal1", USDC_1K, false);
        escrowNoVault.createDeal(payee, "Deal1", ms, splits, false);
        vm.stopPrank();
    }

    function test_CreateDeal_DealsByPayer() public {
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        uint256[] memory ids = escrowNoVault.dealsByPayer(payer);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    function test_CreateDeal_DealsByPayee() public {
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        uint256[] memory ids = escrowNoVault.dealsByPayee(payee);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    function test_CreateDeal_StoresTitleHash() public {
        _oneMilestoneApproval(escrowNoVault, USDC_1K);
        bytes32 expected = keccak256(bytes("Deal1"));
        assertEq(escrowNoVault.getDealTitleHash(0), expected);
    }

    // ── Approval rule happy path ────────────────────────────────────────────

    function test_ApprovalRule_FullFlow() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore   = usdc.balanceOf(address(escrowNoVault));

        vm.prank(payee);
        vm.expectEmit(true, false, false, true, address(escrowNoVault));
        emit ArcticEscrow.MilestoneDelivered(dealId, 0);
        escrowNoVault.markDelivered(dealId, 0);

        vm.prank(payer);
        escrowNoVault.releaseMilestone(dealId, 0);

        uint256 expectedFee = (uint256(USDC_1K) * FEE_BPS) / 10_000;
        uint256 expectedNet = USDC_1K - expectedFee;

        assertEq(usdc.balanceOf(payee)    - payeeBefore,    expectedNet,  "payee net");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee,  "treasury fee");
        assertEq(escrowBefore - usdc.balanceOf(address(escrowNoVault)), USDC_1K, "escrow drained");

        ArcticEscrow.Deal memory d = escrowNoVault.getDeal(dealId);
        assertEq(uint8(d.status), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(d.released, USDC_1K);
    }

    function test_ApprovalRule_EmitsMilestoneReleased() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        uint128 fee = uint128((uint256(USDC_1K) * FEE_BPS) / 10_000);
        vm.prank(payer);
        vm.expectEmit(true, false, false, true, address(escrowNoVault));
        emit ArcticEscrow.MilestoneReleased(dealId, 0, USDC_1K, fee);
        escrowNoVault.releaseMilestone(dealId, 0);
    }

    function test_ApprovalRule_EmitsSplitPaid() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        uint128 net = uint128(uint256(USDC_1K) - (uint256(USDC_1K) * FEE_BPS) / 10_000);
        vm.prank(payer);
        vm.expectEmit(true, false, true, true, address(escrowNoVault));
        emit ArcticEscrow.SplitPaid(dealId, 0, payee, net);
        escrowNoVault.releaseMilestone(dealId, 0);
    }

    // ── Schedule rule happy path ──────────────────────────────────────────────

    function test_ScheduleRule_ReleasedByAnyoneAfterTime() public {
        uint128 releaseTime = uint128(block.timestamp + 1 days);
        uint256 dealId = _oneMilestoneSchedule(escrowNoVault, USDC_1K, releaseTime);

        // Before release time — should revert
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, dealId, 0)
        );
        escrowNoVault.releaseMilestone(dealId, 0);

        vm.warp(block.timestamp + 1 days);

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        // stranger (not payer or payee) can release
        vm.prank(stranger);
        escrowNoVault.releaseMilestone(dealId, 0);

        uint256 expectedFee = (uint256(USDC_1K) * FEE_BPS) / 10_000;
        uint256 expectedNet = USDC_1K - expectedFee;

        assertEq(usdc.balanceOf(payee)    - payeeBefore,    expectedNet, "payee net");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee, "treasury fee");
    }

    // ── Fee math boundary: feeBps=0 and feeBps=100 ─────────────────────────

    function test_FeeBps_Zero_NoFeeCharged() public {
        vm.startPrank(owner);
        ArcticEscrow esc0 = new ArcticEscrow(address(usdc), address(0), treasury, 0, 0);
        vm.stopPrank();

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(esc0), USDC_1K);
        uint256 dealId = esc0.createDeal(payee, "D0", ms, splits, false);
        vm.stopPrank();

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee); esc0.markDelivered(dealId, 0);
        vm.prank(payer); esc0.releaseMilestone(dealId, 0);

        assertEq(usdc.balanceOf(payee)    - payeeBefore,    USDC_1K, "payee gets all");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 0,       "treasury zero");
    }

    function test_FeeBps_100_MaxFee() public {
        vm.startPrank(owner);
        ArcticEscrow esc100 = new ArcticEscrow(address(usdc), address(0), treasury, 100, 0);
        vm.stopPrank();

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(esc100), USDC_1K);
        uint256 dealId = esc100.createDeal(payee, "D100", ms, splits, false);
        vm.stopPrank();

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee); esc100.markDelivered(dealId, 0);
        vm.prank(payer); esc100.releaseMilestone(dealId, 0);

        uint256 expectedFee = (uint256(USDC_1K) * 100) / 10_000; // 1 %
        uint256 expectedNet = USDC_1K - expectedFee;
        assertEq(usdc.balanceOf(payee)    - payeeBefore,    expectedNet,  "payee net");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee,  "treasury fee");
    }

    // ── Multi-split: uneven remainder ends at zero balance ─────────────────

    function test_UnevenSplit_ZeroRemainder() public {
        // 3 recipients with bps 3333 + 3333 + 4334 = 10000
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](3);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 3333});
        splits[1] = ArcticEscrow.SplitInput({recipient: alice, bps: 3333});
        splits[2] = ArcticEscrow.SplitInput({recipient: bob,   bps: 3334});

        vm.startPrank(payer);
        usdc.approve(address(escrowNoVault), USDC_1K);
        uint256 dealId = escrowNoVault.createDeal(payee, "Split3", ms, splits, false);
        vm.stopPrank();

        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);
        vm.prank(payer); escrowNoVault.releaseMilestone(dealId, 0);

        // Contract should hold only treasury fee, already sent; should be 0
        assertEq(usdc.balanceOf(address(escrowNoVault)), 0, "escrow zero balance");
    }

    // ── refundMilestone ────────────────────────────────────────────────────────

    function test_Refund_PayeeCanRefundPending() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payee);
        vm.expectEmit(true, false, false, true, address(escrowNoVault));
        emit ArcticEscrow.MilestoneRefunded(dealId, 0, USDC_1K);
        escrowNoVault.refundMilestone(dealId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, USDC_1K, "payer refund");
        ArcticEscrow.Milestone[] memory m = escrowNoVault.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Refunded));
    }

    function test_Refund_PayeeCanRefundDelivered() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payee);
        escrowNoVault.refundMilestone(dealId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, USDC_1K, "payer refund");
    }

    function test_Refund_PayerCanRefundPending() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrowNoVault.refundMilestone(dealId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, USDC_1K, "payer refund");
    }

    function test_Refund_PayerCannotRefundDelivered() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, dealId, 0)
        );
        escrowNoVault.refundMilestone(dealId, 0);
    }

    // ── pendingYield with no vault ─────────────────────────────────────────

    function test_PendingYield_ZeroWhenNoYield() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        assertEq(escrowNoVault.pendingYield(dealId), 0);
    }

    // ── getDeal / getMilestones / getSplits ───────────────────────────────

    function test_Views_GetDeal() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        ArcticEscrow.Deal memory d = escrowNoVault.getDeal(dealId);
        assertEq(d.payer,  payer);
        assertEq(d.payee,  payee);
        assertEq(d.total,  USDC_1K);
        assertEq(d.feeBps, FEE_BPS);
        assertFalse(d.earnYield);
    }

    function test_Views_GetMilestones() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        ArcticEscrow.Milestone[] memory m = escrowNoVault.getMilestones(dealId);
        assertEq(m.length, 1);
        assertEq(m[0].amount, USDC_1K);
        assertEq(uint8(m[0].rule), uint8(ArcticEscrow.MilestoneRule.Approval));
    }

    function test_Views_GetSplits() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        ArcticEscrow.Split[] memory s = escrowNoVault.getSplits(dealId);
        assertEq(s.length, 1);
        assertEq(s[0].recipient, payee);
        assertEq(s[0].bps, 10_000);
    }

    // ── SplitFailed: reroute to payer ─────────────────────────────────────

    function test_SplitFailed_ReroutesToPayer() public {
        // Set up a deal where alice is the split recipient
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: alice, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(escrowNoVault), USDC_1K);
        uint256 dealId = escrowNoVault.createDeal(payee, "SplitFail", ms, splits, false);
        vm.stopPrank();

        // Block transfers to alice AFTER deal creation
        usdc.setRevertOnTransferTo(alice);

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        uint128 net = uint128(uint256(USDC_1K) - (uint256(USDC_1K) * FEE_BPS) / 10_000);

        vm.prank(payer);
        vm.expectEmit(true, false, true, true, address(escrowNoVault));
        emit ArcticEscrow.SplitFailed(dealId, 0, alice, net);
        escrowNoVault.releaseMilestone(dealId, 0);

        // Share rerouted to payer
        assertEq(usdc.balanceOf(payer) - payerBefore, net, "payer got rerouted share");
        // Milestone completes
        ArcticEscrow.Milestone[] memory m = escrowNoVault.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Released));
    }
}
