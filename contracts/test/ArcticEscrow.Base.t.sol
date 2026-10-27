// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ArcticEscrow} from "../ArcticEscrow.sol";
import {MockUSDC}     from "./mocks/MockUSDC.sol";
import {MockVault}    from "./mocks/MockVault.sol";

/// @dev Shared setup, actors, type aliases and helpers for all ArcticEscrow test suites.
abstract contract ArcticEscrowBase is Test {

    // ── Constants ─────────────────────────────────────────────────────────────
    uint16 internal constant FEE_BPS        = 50;   // 0.5 %
    uint16 internal constant YIELD_FEE_BPS  = 1000; // 10 %

    uint128 internal constant USDC_1K   = 1_000e6;  // 1 000 USDC (6 dec)
    uint128 internal constant USDC_100K = 100_000e6;

    // ── Actors ────────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal payer    = makeAddr("payer");
    address internal payee    = makeAddr("payee");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockUSDC      internal usdc;
    MockVault     internal mockVault;
    ArcticEscrow  internal escrow;        // escrow WITH vault
    ArcticEscrow  internal escrowNoVault; // escrow WITHOUT vault

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        vm.startPrank(owner);

        usdc      = new MockUSDC();
        mockVault = new MockVault(address(usdc));

        // Seed the vault with USDC so it can pay yield
        usdc.mint(address(mockVault), USDC_100K);

        escrow = new ArcticEscrow(
            address(usdc),
            address(mockVault),
            treasury,
            FEE_BPS,
            YIELD_FEE_BPS
        );

        escrowNoVault = new ArcticEscrow(
            address(usdc),
            address(0),
            treasury,
            FEE_BPS,
            YIELD_FEE_BPS
        );

        vm.stopPrank();

        // Fund payer with USDC
        usdc.mint(payer,  USDC_100K);
        usdc.mint(alice,  USDC_100K);
    }

    // ── Helper builders ───────────────────────────────────────────────────────

    /// @dev Single-milestone Approval deal, single split to payee.
    function _oneMilestoneApproval(
        ArcticEscrow esc,
        uint128 amount
    ) internal returns (uint256 dealId) {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title:       "MS1",
            amount:      amount,
            rule:        ArcticEscrow.MilestoneRule.Approval,
            releaseTime: 0
        });

        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(esc), amount);
        dealId = esc.createDeal(payee, "Deal1", ms, splits, false);
        vm.stopPrank();
    }

    /// @dev Single-milestone Schedule deal, single split to payee.
    function _oneMilestoneSchedule(
        ArcticEscrow esc,
        uint128 amount,
        uint128 releaseTime
    ) internal returns (uint256 dealId) {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = ArcticEscrow.MilestoneInput({
            title:       "MS1",
            amount:      amount,
            rule:        ArcticEscrow.MilestoneRule.Schedule,
            releaseTime: releaseTime
        });

        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        vm.startPrank(payer);
        usdc.approve(address(esc), amount);
        dealId = esc.createDeal(payee, "Deal1", ms, splits, false);
        vm.stopPrank();
    }

    /// @dev Two-milestone Approval deal with yield, single split to payee.
    function _twoMilestoneYield(
        uint128 amt0,
        uint128 amt1
    ) internal returns (uint256 dealId) {
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](2);
        ms[0] = ArcticEscrow.MilestoneInput({
            title:       "MS1",
            amount:      amt0,
            rule:        ArcticEscrow.MilestoneRule.Approval,
            releaseTime: 0
        });
        ms[1] = ArcticEscrow.MilestoneInput({
            title:       "MS2",
            amount:      amt1,
            rule:        ArcticEscrow.MilestoneRule.Approval,
            releaseTime: 0
        });

        ArcticEscrow.SplitInput[] memory splits = new ArcticEscrow.SplitInput[](1);
        splits[0] = ArcticEscrow.SplitInput({recipient: payee, bps: 10_000});

        uint256 total = uint256(amt0) + uint256(amt1);
        vm.startPrank(payer);
        usdc.approve(address(escrow), total);
        dealId = escrow.createDeal(payee, "YieldDeal", ms, splits, true);
        vm.stopPrank();
    }

    /// @dev Approve + release an Approval milestone.
    function _approveAndRelease(ArcticEscrow esc, uint256 dealId, uint256 idx) internal {
        vm.prank(payee);
        esc.markDelivered(dealId, idx);
        vm.prank(payer);
        esc.releaseMilestone(dealId, idx);
    }
}
