// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";
import {MockVault}        from "./mocks/MockVault.sol";
import {ReentrantAttacker} from "./mocks/ReentrantAttacker.sol";

/// @dev Yield-mode tests: ERC-4626 accrual, yieldFee, shortfall, proportional
///      share burning, refund with yield, reentrancy guard, pendingYield.
contract ArcticEscrowYieldTest is ArcticEscrowBase {

    // ── Yield happy path: single milestone ────────────────────────────────────

    function test_Yield_SingleMilestone_10Pct() public {
        mockVault.setYieldBps(1000); // 10 % yield

        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);
        // Release only milestone 0 for this test
        uint256 payerBefore    = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 payeeBefore    = usdc.balanceOf(payee);

        vm.prank(payee); escrow.markDelivered(dealId, 0);
        vm.prank(payer); escrow.releaseMilestone(dealId, 0);

        // principal = 1000e6, yield = 100e6
        // fee = 1000e6 * 50 / 10000 = 5e6
        // net principal to payee = 995e6
        // yield fee = 100e6 * 1000 / 10000 = 10e6
        // yield net to payer = 90e6
        uint256 principalFee    = (uint256(USDC_1K) * FEE_BPS)       / 10_000;
        uint256 yieldAmt        = (uint256(USDC_1K) * 1000)           / 10_000;
        uint256 yieldFee        = (yieldAmt         * YIELD_FEE_BPS)  / 10_000;
        uint256 yieldNet        = yieldAmt - yieldFee;

        assertEq(usdc.balanceOf(payee)    - payeeBefore,    USDC_1K - principalFee, "payee net");
        assertEq(usdc.balanceOf(payer)    - payerBefore,    yieldNet,               "payer yield");
        assertEq(
            usdc.balanceOf(treasury) - treasuryBefore,
            principalFee + yieldFee,
            "treasury = fee + yieldFee"
        );
    }

    function test_Yield_EmitsYieldHarvested() public {
        mockVault.setYieldBps(1000);

        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        uint128 yieldAmt = uint128((uint256(USDC_1K) * 1000) / 10_000); // 100e6
        uint128 yieldFee = uint128((uint256(yieldAmt) * YIELD_FEE_BPS) / 10_000); // 10e6
        uint128 yieldNet = yieldAmt - yieldFee;

        vm.prank(payee); escrow.markDelivered(dealId, 0);
        vm.prank(payer);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit ArcticEscrow.YieldHarvested(dealId, 0, yieldNet, yieldFee, 0);
        escrow.releaseMilestone(dealId, 0);
    }

    // ── Proportional share burn across 2 milestones ────────────────────────

    function test_Yield_ProportionalShareBurn_TwoMilestones() public {
        mockVault.setYieldBps(1000); // 10 % yield
        // 2 milestones: 1000e6 each, total 2000e6
        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        uint256 escrowBalBefore = usdc.balanceOf(address(escrow));

        // Release ms0
        vm.prank(payee); escrow.markDelivered(dealId, 0);
        vm.prank(payer); escrow.releaseMilestone(dealId, 0);

        // Release ms1
        vm.prank(payee); escrow.markDelivered(dealId, 1);
        vm.prank(payer); escrow.releaseMilestone(dealId, 1);

        // Escrow should have transferred all funds out
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow zero after all released");

        ArcticEscrow.Deal memory d = escrow.getDeal(dealId);
        assertEq(uint8(d.status), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(d.shares, 0, "all shares burned");
    }

    // ── yieldFeeBps=0 → full yield to payer ──────────────────────────────────

    function test_Yield_YieldFeeBps0_FullYieldToPayer() public {
        vm.startPrank(owner);
        ArcticEscrow escYF0 = new ArcticEscrow(
            address(usdc), address(mockVault), treasury, 0, 0
        );
        vm.stopPrank();

        mockVault.setYieldBps(1000);

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(escYF0), USDC_1K);
        uint256 dealId = escYF0.createDeal(payee, "D", ms, splits, true);
        vm.stopPrank();

        uint256 payerBefore    = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee); escYF0.markDelivered(dealId, 0);
        vm.prank(payer); escYF0.releaseMilestone(dealId, 0);

        uint256 yieldAmt = (uint256(USDC_1K) * 1000) / 10_000; // 100e6
        assertEq(usdc.balanceOf(payer)    - payerBefore,    yieldAmt, "payer full yield");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 0,        "zero yield fee");
    }

    // ── yieldFeeBps=2000 (max) ────────────────────────────────────────────────

    function test_Yield_YieldFeeBps2000_MaxYieldFee() public {
        vm.startPrank(owner);
        ArcticEscrow escYF20 = new ArcticEscrow(
            address(usdc), address(mockVault), treasury, 0, 2000
        );
        vm.stopPrank();

        mockVault.setYieldBps(1000);

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(escYF20), USDC_1K);
        uint256 dealId = escYF20.createDeal(payee, "D", ms, splits, true);
        vm.stopPrank();

        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee); escYF20.markDelivered(dealId, 0);
        vm.prank(payer); escYF20.releaseMilestone(dealId, 0);

        uint256 yieldAmt = (uint256(USDC_1K) * 1000) / 10_000; // 100e6
        uint256 yieldFee = (yieldAmt * 2000) / 10_000;          // 20e6
        uint256 yieldNet = yieldAmt - yieldFee;                  // 80e6
        assertEq(usdc.balanceOf(payer)    - payerBefore,    yieldNet, "payer yield net");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, yieldFee, "treasury yield fee");
    }

    // ── Vault returns less than principal (shortfall) ─────────────────────────

    function test_Yield_Shortfall_ReleaseSucceeds() public {
        mockVault.setShortfallBps(500); // 5 % loss

        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payee); escrow.markDelivered(dealId, 0);

        // shortfall = 1000e6 * 500 / 10000 = 50e6 → effectivePrincipal = 950e6
        uint256 shortfall    = (uint256(USDC_1K) * 500) / 10_000; // 50e6
        uint256 effectiveP   = USDC_1K - shortfall;               // 950e6
        uint128 expectedShortfall = uint128(shortfall);

        vm.prank(payer);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit ArcticEscrow.YieldHarvested(dealId, 0, 0, 0, expectedShortfall);
        escrow.releaseMilestone(dealId, 0);

        // No yield to payer (shortfall scenario)
        assertEq(usdc.balanceOf(payer) - payerBefore, 0, "payer no extra");

        ArcticEscrow.Milestone[] memory m = escrow.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Released));
    }

    // ── Refund with yield: principal + net yield returned to payer ────────────

    function test_Yield_Refund_ReturnsPrincipalPlusNetYield() public {
        mockVault.setYieldBps(1000);

        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        uint256 payerBefore    = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(payee);
        escrow.refundMilestone(dealId, 0);

        // principal 1000e6, yield 100e6
        // yieldFee = 100e6 * 1000 / 10000 = 10e6
        // returnAmt = 1000e6 + (100e6 - 10e6) = 1090e6
        uint256 yieldAmt    = (uint256(USDC_1K) * 1000) / 10_000;
        uint256 yieldFeeAmt = (yieldAmt * YIELD_FEE_BPS) / 10_000;
        uint256 expectedReturn = USDC_1K + (yieldAmt - yieldFeeAmt);

        assertEq(usdc.balanceOf(payer)    - payerBefore,    expectedReturn, "payer refund");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, yieldFeeAmt,    "treasury yield fee");
    }

    // ── pendingYield returns correct value ────────────────────────────────────

    function test_PendingYield_ReturnsCorrectValue() public {
        mockVault.setYieldBps(1000);

        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        // Total deposited = 2000e6, yield 10 % → assets = 2200e6, pending = 200e6
        uint256 expectedYield = (uint256(USDC_1K) * 2 * 1000) / 10_000;
        assertEq(escrow.pendingYield(dealId), expectedYield, "pending yield");
    }

    function test_PendingYield_ZeroWhenNoShares() public {
        // No yield deal
        uint256 dealId = _oneMilestoneApproval(escrow, USDC_1K);
        assertEq(escrow.pendingYield(dealId), 0);
    }

    // ── Reentrancy guard blocks reentrant releaseMilestone ────────────────────

    function test_Reentrancy_ReleaseMilestone_Blocked() public {
        // Deploy attacker, pointing at escrow
        ReentrantAttacker attacker = new ReentrantAttacker(address(escrow));

        // Wire vault to call attacker on redeem
        // We'll set the reentrant calldata to call releaseMilestone(dealId, 0) again
        // but first create the deal so we know dealId = 0
        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        bytes memory attackData = abi.encodeCall(
            ArcticEscrow.releaseMilestone, (dealId, 0)
        );
        attacker.setTarget(dealId, 0);
        mockVault.setReentrantAttack(address(attacker), attackData);

        // Deliver ms0 so payer can release
        vm.prank(payee); escrow.markDelivered(dealId, 0);

        // The outer release should succeed (reentrancy guard lets it through)
        // but the inner reentrant call must revert
        vm.prank(payer);
        escrow.releaseMilestone(dealId, 0);

        // Verify the attacker fired and the inner call was blocked
        assertTrue(attacker.attackFired(),     "attack attempted");
        assertTrue(attacker.attackReverted(),  "inner call reverted");

        // Outer milestone should still be released
        ArcticEscrow.Milestone[] memory m = escrow.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Released));
    }
}
