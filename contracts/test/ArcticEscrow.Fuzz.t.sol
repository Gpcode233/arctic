// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

/// @dev Fuzz tests: random amounts/bps, zero USDC balance invariant after
///      all milestones are released or refunded.
contract ArcticEscrowFuzzTest is ArcticEscrowBase {

    // ─── Fuzz: single milestone, arbitrary amount, zero remainder ─────────────

    /// @dev For any valid amount and fee, the contract ends with zero USDC balance.
    function testFuzz_SingleMilestone_ZeroRemainder(uint128 amount) public {
        // Bound to a sensible range for 6-decimal USDC
        amount = uint128(bound(amount, 1e6, 1_000_000e6));

        usdc.mint(payer, amount);

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M1", amount: amount,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.prank(payer);
        usdc.approve(address(escrowNoVault), amount);
        vm.prank(payer);
        uint256 dealId = escrowNoVault.createDeal(payee, "Deal", ms, sp, false);

        _approveAndRelease(escrowNoVault, dealId, 0);

        assertEq(usdc.balanceOf(address(escrowNoVault)), 0, "escrow zero");
    }

    // ─── Fuzz: two splits with arbitrary bps, zero remainder ──────────────────

    /// @dev Random bps split (both ≥1, sum == 10000) yields zero escrow balance.
    function testFuzz_TwoSplits_ZeroRemainder(uint16 bps0) public {
        // bps0 in [1, 9999] so bps1 = 10000-bps0 is in [1, 9999]
        bps0 = uint16(bound(bps0, 1, 9_999));
        uint16 bps1 = 10_000 - bps0;

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });

        ArcticEscrow.SplitInput[] memory sp = new ArcticEscrow.SplitInput[](2);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: bps0});
        sp[1] = ArcticEscrow.SplitInput({recipient: alice, bps: bps1});

        vm.prank(payer);
        usdc.approve(address(escrowNoVault), USDC_1K);
        vm.prank(payer);
        uint256 dealId = escrowNoVault.createDeal(payee, "Deal", ms, sp, false);

        _approveAndRelease(escrowNoVault, dealId, 0);

        assertEq(usdc.balanceOf(address(escrowNoVault)), 0, "escrow zero");
    }

    // ─── Fuzz: multiple milestones (2-5), arbitrary amounts, zero remainder ───

    /// @dev Random milestone count and amounts — all released → escrow empty.
    function testFuzz_MultiMilestone_ZeroRemainder(
        uint8  mCount,
        uint64 amt0,
        uint64 amt1,
        uint64 amt2
    ) public {
        mCount = uint8(bound(mCount, 2, 3));
        amt0   = uint64(bound(amt0, 1e6, 100_000e6));
        amt1   = uint64(bound(amt1, 1e6, 100_000e6));
        amt2   = uint64(bound(amt2, 1e6, 100_000e6));

        uint64[3] memory amts = [amt0, amt1, amt2];

        uint256 total;
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](mCount);
        for (uint256 i; i < mCount; ++i) {
            ms[i] = ArcticEscrow.MilestoneInput({
                title: "M",
                amount: amts[i],
                rule: ArcticEscrow.MilestoneRule.Approval,
                releaseTime: 0
            });
            total += amts[i];
        }

        ArcticEscrow.SplitInput[] memory sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        usdc.mint(payer, total);

        vm.prank(payer);
        usdc.approve(address(escrowNoVault), total);
        vm.prank(payer);
        uint256 dealId = escrowNoVault.createDeal(payee, "Deal", ms, sp, false);

        for (uint256 i; i < mCount; ++i) {
            _approveAndRelease(escrowNoVault, dealId, i);
        }

        assertEq(usdc.balanceOf(address(escrowNoVault)), 0, "escrow zero");
    }

    // ─── Fuzz: refund all milestones → zero escrow balance ────────────────────

    function testFuzz_RefundAll_ZeroRemainder(uint128 amount) public {
        amount = uint128(bound(amount, 1e6, 1_000_000e6));
        usdc.mint(payer, amount);

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M1", amount: amount,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.prank(payer);
        usdc.approve(address(escrowNoVault), amount);
        vm.prank(payer);
        uint256 dealId = escrowNoVault.createDeal(payee, "Deal", ms, sp, false);

        vm.prank(payee);
        escrowNoVault.refundMilestone(dealId, 0);

        assertEq(usdc.balanceOf(address(escrowNoVault)), 0, "escrow zero after refund");
    }

    // ─── Fuzz: fee math — principal_fee + net == principal ────────────────────

    /// @dev For any principal and feeBps, fee + net must equal principal (no rounding loss stuck in contract).
    function testFuzz_FeeMath_SumsToGross(uint128 amount, uint16 feeBps_) public {
        amount  = uint128(bound(amount,  1e6,      1_000_000e6));
        feeBps_ = uint16(bound(feeBps_, 0,         100));

        vm.prank(owner);
        ArcticEscrow esc = new ArcticEscrow(address(usdc), address(0), treasury, feeBps_, 0);

        usdc.mint(payer, amount);

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "M", amount: amount,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory sp = new ArcticEscrow.SplitInput[](1);
        sp[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.prank(payer);
        usdc.approve(address(esc), amount);
        vm.prank(payer);
        uint256 dealId = esc.createDeal(payee, "D", ms, sp, false);

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee); esc.markDelivered(dealId, 0);
        vm.prank(payer); esc.releaseMilestone(dealId, 0);

        uint256 payeeNet   = usdc.balanceOf(payee)    - payeeBefore;
        uint256 treasFee   = usdc.balanceOf(treasury) - treasuryBefore;

        assertEq(payeeNet + treasFee, amount, "fee + net == gross");
        assertEq(usdc.balanceOf(address(esc)), 0, "escrow zero");
    }
}
