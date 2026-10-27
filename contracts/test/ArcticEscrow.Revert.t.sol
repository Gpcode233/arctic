// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

/// @dev Revert / access-control tests for createDeal, markDelivered,
///      releaseMilestone, and refundMilestone.
contract ArcticEscrowRevertTest is ArcticEscrowBase {

    // ─── createDeal validation ─────────────────────────────────────────────────

    function test_Revert_CreateDeal_ZeroPayee() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        escrowNoVault.createDeal(address(0), "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_PayeeEqualsPayer() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payer);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.PayeeEqualsPayer.selector);
        escrowNoVault.createDeal(payer, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_EmptyTitle() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidTitle.selector);
        escrowNoVault.createDeal(payee, "", ms, sp, false);
    }

    function test_Revert_CreateDeal_TitleTooLong() public {
        // 81 characters
        string memory longTitle = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        // ensure it's >80 bytes
        require(bytes(longTitle).length > 80, "test setup: title must be >80");

        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidTitle.selector);
        escrowNoVault.createDeal(payee, longTitle, ms, sp, false);
    }

    function test_Revert_CreateDeal_ZeroMilestones() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](0);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidMilestones.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_TooManyMilestones() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](21);
        for (uint256 i; i < 21; ++i) {
            ms[i] = ArcticEscrow.MilestoneInput({
                title: "M", amount: USDC_1K,
                rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
            });
        }
        ArcticEscrow.SplitInput[] memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidMilestones.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_ZeroSplits() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = new ArcticEscrow.SplitInput[](0);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidSplits.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_TooManySplits() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = new ArcticEscrow.SplitInput[](11);
        // bps sum won't be 10000 either but length check fires first
        for (uint256 i; i < 11; ++i) {
            sp[i] = ArcticEscrow.SplitInput({recipient: payee, bps: 100});
        }

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidSplits.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_BpsSumNot10000() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = new ArcticEscrow.SplitInput[](2);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 5000});
        sp[1] = ArcticEscrow.SplitInput({recipient: alice, bps: 4000}); // 9000 != 10000

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidSplits.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_ZeroSplitRecipient() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: address(0), bps: 10_000});

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidSplits.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_ZeroMilestoneAmount() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M", amount: 0,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.InvalidAmount.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_ScheduleReleaseTimeInPast() public {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Schedule,
            releaseTime: uint128(block.timestamp) // == now, not > now
        });
        ArcticEscrow.SplitInput[] memory sp = _singleSplit(payee);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.InvalidReleaseTime.selector, 0, 0)
        );
        escrowNoVault.createDeal(payee, "T", ms, sp, false);
    }

    function test_Revert_CreateDeal_EarnYieldWithNoVault() public {
        ArcticEscrow.MilestoneInput[] memory ms = _singleMs(USDC_1K);
        ArcticEscrow.SplitInput[]     memory sp = _singleSplit(payee);

        vm.prank(payer);
        usdc.approve(address(escrowNoVault), USDC_1K);
        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.NoVault.selector);
        escrowNoVault.createDeal(payee, "T", ms, sp, true);
    }

    // ─── markDelivered access control ─────────────────────────────────────────

    function test_Revert_MarkDelivered_NonPayee() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(stranger);
        vm.expectRevert(ArcticEscrow.NotPayee.selector);
        escrowNoVault.markDelivered(dealId, 0);
    }

    function test_Revert_MarkDelivered_Payer() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(payer);
        vm.expectRevert(ArcticEscrow.NotPayee.selector);
        escrowNoVault.markDelivered(dealId, 0);
    }

    function test_Revert_MarkDelivered_AlreadyDelivered() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, dealId, 0)
        );
        escrowNoVault.markDelivered(dealId, 0);
    }

    function test_Revert_MarkDelivered_DealNotFound() public {
        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.DealNotFound.selector, 999)
        );
        escrowNoVault.markDelivered(999, 0);
    }

    // ─── releaseMilestone access control ──────────────────────────────────────

    function test_Revert_Release_Approval_NonPayer() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        vm.prank(payee); escrowNoVault.markDelivered(dealId, 0);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, dealId, 0)
        );
        escrowNoVault.releaseMilestone(dealId, 0);
    }

    function test_Revert_Release_Approval_NotDelivered() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        // Milestone is still Pending; payer tries to release
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, dealId, 0)
        );
        escrowNoVault.releaseMilestone(dealId, 0);
    }

    function test_Revert_Release_AlreadyReleased() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        _approveAndRelease(escrowNoVault, dealId, 0);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.DealCompleted.selector, dealId)
        );
        escrowNoVault.releaseMilestone(dealId, 0);
    }

    function test_Revert_Release_DealNotFound() public {
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.DealNotFound.selector, 42)
        );
        escrowNoVault.releaseMilestone(42, 0);
    }

    // ─── refundMilestone access control ───────────────────────────────────────

    function test_Revert_Refund_Stranger() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(stranger);
        vm.expectRevert(ArcticEscrow.NotPayee.selector);
        escrowNoVault.refundMilestone(dealId, 0);
    }

    function test_Revert_Refund_AlreadyRefunded() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        vm.prank(payee); escrowNoVault.refundMilestone(dealId, 0);

        // deal is now Completed; second refund must revert
        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.DealCompleted.selector, dealId)
        );
        escrowNoVault.refundMilestone(dealId, 0);
    }

    function test_Revert_Refund_AlreadyReleased() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);
        _approveAndRelease(escrowNoVault, dealId, 0);

        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(ArcticEscrow.DealCompleted.selector, dealId)
        );
        escrowNoVault.refundMilestone(dealId, 0);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _singleMs(uint128 amount)
        internal
        pure
        returns (ArcticEscrow.MilestoneInput[] memory ms)
    {
        ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M", amount: amount,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
    }

    function _singleSplit(address recipient)
        internal
        pure
        returns (ArcticEscrow.SplitInput[] memory sp)
    {
        sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: recipient, bps: 10_000});
    }
}
