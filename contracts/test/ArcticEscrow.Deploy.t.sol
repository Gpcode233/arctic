// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";
import {MockVault}        from "./mocks/MockVault.sol";
import {MockUSDC}         from "./mocks/MockUSDC.sol";
import {Ownable}          from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Deployment, constructor validation, admin functions.
contract ArcticEscrowDeployTest is ArcticEscrowBase {

    // ── Constructor happy-path ─────────────────────────────────────────────────

    function test_Deploy_StoresParams() public view {
        assertEq(address(escrow.usdc()),    address(usdc));
        assertEq(address(escrow.vault()),   address(mockVault));
        assertEq(escrow.treasury(),          treasury);
        assertEq(escrow.feeBps(),            FEE_BPS);
        assertEq(escrow.yieldFeeBps(),       YIELD_FEE_BPS);
        assertEq(escrow.dealCount(),         0);
    }

    function test_Deploy_NoVault_StoresZeroVault() public view {
        assertEq(address(escrowNoVault.vault()), address(0));
    }

    // ── Constructor revert: ZeroAddress ───────────────────────────────────────

    function test_Deploy_Revert_ZeroUSDC() public {
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        new ArcticEscrow(address(0), address(0), treasury, 0, 0);
    }

    function test_Deploy_Revert_ZeroTreasury() public {
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        new ArcticEscrow(address(usdc), address(0), address(0), 0, 0);
    }

    // ── Constructor revert: InvalidFee ────────────────────────────────────────

    function test_Deploy_Revert_FeeBpsTooHigh() public {
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        new ArcticEscrow(address(usdc), address(0), treasury, 101, 0);
    }

    function test_Deploy_Revert_YieldFeeBpsTooHigh() public {
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        new ArcticEscrow(address(usdc), address(0), treasury, 0, 2001);
    }

    // ── Constructor revert: VaultAssetMismatch ────────────────────────────────

    function test_Deploy_Revert_VaultAssetMismatch() public {
        // Create a vault whose asset is NOT usdc
        MockUSDC   otherToken = new MockUSDC();
        MockVault  badVault   = new MockVault(address(otherToken));

        vm.expectRevert(ArcticEscrow.VaultAssetMismatch.selector);
        new ArcticEscrow(address(usdc), address(badVault), treasury, 0, 0);
    }

    // ── setFeeBps ─────────────────────────────────────────────────────────────

    function test_Admin_SetFeeBps_Happy() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(escrow));
        emit ArcticEscrow.FeeBpsUpdated(10);
        escrow.setFeeBps(10);
        assertEq(escrow.feeBps(), 10);
    }

    function test_Admin_SetFeeBps_Revert_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        escrow.setFeeBps(101);
    }

    function test_Admin_SetFeeBps_Revert_NonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        escrow.setFeeBps(10);
    }

    // ── setYieldFeeBps ────────────────────────────────────────────────────────

    function test_Admin_SetYieldFeeBps_Happy() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(escrow));
        emit ArcticEscrow.YieldFeeBpsUpdated(500);
        escrow.setYieldFeeBps(500);
        assertEq(escrow.yieldFeeBps(), 500);
    }

    function test_Admin_SetYieldFeeBps_Revert_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        escrow.setYieldFeeBps(2001);
    }

    function test_Admin_SetYieldFeeBps_BoundaryOk() public {
        vm.prank(owner);
        escrow.setYieldFeeBps(2000);
        assertEq(escrow.yieldFeeBps(), 2000);
    }

    function test_Admin_SetFeeBps_BoundaryOk() public {
        vm.prank(owner);
        escrow.setFeeBps(100);
        assertEq(escrow.feeBps(), 100);
    }

    // ── setTreasury ───────────────────────────────────────────────────────────

    function test_Admin_SetTreasury_Happy() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(escrow));
        emit ArcticEscrow.TreasuryUpdated(alice);
        escrow.setTreasury(alice);
        assertEq(escrow.treasury(), alice);
    }

    function test_Admin_SetTreasury_Revert_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    function test_Admin_Pause_RevertOnCreateDeal() public {
        vm.prank(owner);
        escrow.pause();

        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title: "MS1", amount: USDC_1K,
            rule: ArcticEscrow.MilestoneRule.Approval, releaseTime: 0
        });
        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.prank(payer);
        usdc.approve(address(escrow), USDC_1K);
        vm.prank(payer);
        vm.expectRevert();
        escrow.createDeal(payee, "Deal1", ms, splits, false);
    }

    function test_Admin_Pause_DoesNotBlockRelease() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(owner);
        escrowNoVault.pause();

        // Mark delivered and release should still work while paused
        vm.prank(payee);
        escrowNoVault.markDelivered(dealId, 0);
        vm.prank(payer);
        escrowNoVault.releaseMilestone(dealId, 0);

        ArcticEscrow.Milestone[] memory m = escrowNoVault.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Released));
    }

    function test_Admin_Pause_DoesNotBlockRefund() public {
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        vm.prank(owner);
        escrowNoVault.pause();

        vm.prank(payee);
        escrowNoVault.refundMilestone(dealId, 0);

        ArcticEscrow.Milestone[] memory m = escrowNoVault.getMilestones(dealId);
        assertEq(uint8(m[0].state), uint8(ArcticEscrow.MilestoneState.Refunded));
    }

    // ── Fee snapshot — admin change doesn't affect existing deals ─────────────

    function test_FeeSnapshot_AdminChangeDoesNotAffectExistingDeal() public {
        // Create deal at FEE_BPS = 50
        uint256 dealId = _oneMilestoneApproval(escrowNoVault, USDC_1K);

        // Admin changes fee to 100
        vm.prank(owner);
        escrowNoVault.setFeeBps(100);

        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        _approveAndRelease(escrowNoVault, dealId, 0);

        // fee should still be 50 bps (snapshotted)
        uint256 expectedFee = (uint256(USDC_1K) * FEE_BPS) / 10_000;
        uint256 expectedNet = USDC_1K - expectedFee;

        assertEq(usdc.balanceOf(payee)    - payeeBefore,    expectedNet, "payee net");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee, "treasury fee");
    }

    function test_YieldFeeSnapshot_AdminChangeDoesNotAffectExistingDeal() public {
        // Create yield deal at YIELD_FEE_BPS = 1000 (10 %)
        mockVault.setYieldBps(1000); // 10 % yield
        uint256 dealId = _twoMilestoneYield(USDC_1K, USDC_1K);

        // Admin bumps yield fee to 2000 (20 %)
        vm.prank(owner);
        escrow.setYieldFeeBps(2000);

        uint256 payerBefore    = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        // release ms0 — yield fee should still be 1000 bps
        vm.prank(payee); escrow.markDelivered(dealId, 0);
        vm.prank(payer); escrow.releaseMilestone(dealId, 0);

        // principal 1000e6, yield 10 % → yieldAmt = 100e6
        // yieldFee = 100e6 * 1000 / 10000 = 10e6
        // yieldNet = 90e6
        uint256 expectedYieldFee = (USDC_1K * 1000) / 10_000; // 100e6 * 1000/10000 = 10e6
        uint256 expectedYieldNet = USDC_1K - expectedYieldFee; // 90e6
        // Actual yield on 1000e6 principal at 10 % = 100e6
        uint256 actualYield = (USDC_1K * 1000) / 10_000; // 100e6
        expectedYieldFee = (actualYield * 1000) / 10_000;
        expectedYieldNet = actualYield - expectedYieldFee;

        assertEq(usdc.balanceOf(payer) - payerBefore, expectedYieldNet, "payer yield net");
        assertEq(
            usdc.balanceOf(treasury) - treasuryBefore,
            (uint256(USDC_1K) * FEE_BPS) / 10_000 + expectedYieldFee,
            "treasury total"
        );
    }
}
