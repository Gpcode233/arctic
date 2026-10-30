// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ArcticEscrow} from "../ArcticEscrow.sol";
import {MockUSDC}     from "./mocks/MockUSDC.sol";

/// @dev Shared setup, actors and builders for all ArcticEscrow test suites.
abstract contract ArcticEscrowBase is Test {

    // ── Constants ─────────────────────────────────────────────────────────────
    uint16  internal constant FEE_BPS   = 50;        // 0.5 %
    uint32  internal constant REVIEW    = 7 days;
    uint64  internal constant DELIVER   = 30 days;   // deliverBy offset from now
    uint128 internal constant USDC_1K   = 1_000e6;
    uint128 internal constant USDC_100K = 100_000e6;

    // ── Actors ────────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal payer    = makeAddr("payer");
    address internal payee    = makeAddr("payee");
    address internal arbiter  = makeAddr("arbiter");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    MockUSDC     internal usdc;
    ArcticEscrow internal escrow;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        usdc   = new MockUSDC();
        escrow = new ArcticEscrow(address(usdc), treasury, FEE_BPS, owner);
        usdc.mint(payer, USDC_100K);
        usdc.mint(alice, USDC_100K);
    }

    // ── Input builders ────────────────────────────────────────────────────────

    function _approvalMs(uint128 amount) internal view returns (ArcticEscrow.MilestoneInput memory) {
        return ArcticEscrow.MilestoneInput({
            title:       "MS",
            amount:      amount,
            rule:        ArcticEscrow.MilestoneRule.Approval,
            releaseTime: 0,
            deliverBy:   uint64(block.timestamp) + DELIVER
        });
    }

    function _scheduleMs(uint128 amount, uint64 releaseTime) internal pure returns (ArcticEscrow.MilestoneInput memory) {
        return ArcticEscrow.MilestoneInput({
            title:       "MS",
            amount:      amount,
            rule:        ArcticEscrow.MilestoneRule.Schedule,
            releaseTime: releaseTime,
            deliverBy:   0
        });
    }

    function _one(ArcticEscrow.MilestoneInput memory m) internal pure returns (ArcticEscrow.MilestoneInput[] memory ms) {
        ms = new ArcticEscrow.MilestoneInput[](1);
        ms[0] = m;
    }

    function _splitTo(address to) internal pure returns (ArcticEscrow.SplitInput[] memory s) {
        s = new ArcticEscrow.SplitInput[](1);
        s[0] = ArcticEscrow.SplitInput({recipient: to, bps: 10_000});
    }

    function _sum(ArcticEscrow.MilestoneInput[] memory ms) internal pure returns (uint256 total) {
        for (uint256 i; i < ms.length; ++i) total += ms[i].amount;
    }

    // ── Deal builders ─────────────────────────────────────────────────────────

    function _create(
        ArcticEscrow.MilestoneInput[] memory ms,
        ArcticEscrow.SplitInput[]     memory splits,
        address arb
    ) internal returns (uint256 dealId) {
        vm.startPrank(payer);
        usdc.approve(address(escrow), _sum(ms));
        dealId = escrow.createDeal(payee, arb, "Deal", ms, splits, REVIEW);
        vm.stopPrank();
    }

    function _accept(uint256 dealId) internal {
        vm.prank(payee);
        escrow.acceptDeal(dealId);
    }

    /// @dev Accepted single Approval milestone deal paying the payee.
    function _approvalDeal(uint128 amount, address arb) internal returns (uint256 dealId) {
        dealId = _create(_one(_approvalMs(amount)), _splitTo(payee), arb);
        _accept(dealId);
    }

    /// @dev Accepted single Schedule milestone deal paying the payee.
    function _scheduleDeal(uint128 amount, uint64 releaseTime) internal returns (uint256 dealId) {
        dealId = _create(_one(_scheduleMs(amount, releaseTime)), _splitTo(payee), address(0));
        _accept(dealId);
    }

    function _deliver(uint256 dealId, uint256 idx) internal {
        vm.prank(payee);
        escrow.markDelivered(dealId, idx);
    }

    function _net(uint256 gross) internal pure returns (uint256) {
        return gross - (gross * FEE_BPS) / 10_000;
    }

    function _state(uint256 dealId, uint256 idx) internal view returns (ArcticEscrow.MilestoneState) {
        return escrow.getMilestones(dealId)[idx].state;
    }

    function _status(uint256 dealId) internal view returns (ArcticEscrow.DealStatus) {
        return escrow.getDeal(dealId).status;
    }

    /// @dev Escrow solvency invariant: holds at least what it owes.
    function _assertSolvent() internal view {
        assertGe(usdc.balanceOf(address(escrow)), escrow.liabilities(), "insolvent");
    }
}
