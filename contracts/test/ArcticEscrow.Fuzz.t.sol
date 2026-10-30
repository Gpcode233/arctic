// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";

contract ArcticEscrowFuzzTest is ArcticEscrowBase {

    function testFuzz_FeeMath_SumsToGross(uint128 amount, uint16 fee) public {
        amount = uint128(bound(amount, 1, USDC_100K));
        fee    = uint16(bound(fee, 0, 100));
        vm.prank(owner);
        escrow.setFeeBps(fee);

        uint256 id = _approvalDeal(amount, address(0));
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);

        assertEq(usdc.balanceOf(payee) + usdc.balanceOf(treasury), amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.liabilities(), 0);
    }

    function testFuzz_Splits_NoDust(uint128 amount, uint16 bpsA, uint16 bpsB) public {
        amount = uint128(bound(amount, 1, USDC_100K));
        bpsA   = uint16(bound(bpsA, 1, 9_998));
        bpsB   = uint16(bound(bpsB, 1, 9_999 - bpsA));

        ArcticEscrow.SplitInput[] memory s = new ArcticEscrow.SplitInput[](3);
        s[0] = ArcticEscrow.SplitInput({recipient: payee, bps: bpsA});
        s[1] = ArcticEscrow.SplitInput({recipient: bob,   bps: bpsB});
        s[2] = ArcticEscrow.SplitInput({recipient: stranger, bps: 10_000 - bpsA - bpsB});
        uint256 id = _create(_one(_approvalMs(amount)), s, address(0));
        _accept(id);
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);

        uint256 paid = usdc.balanceOf(payee) + usdc.balanceOf(bob) + usdc.balanceOf(stranger);
        assertEq(paid, _net(amount));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// @dev Random mix of releases and refunds across many milestones always
    ///      settles exactly, with no dust and no insolvency along the way.
    function testFuzz_MixedSettlement(uint8 count, uint256 seed) public {
        count = uint8(bound(count, 1, 20));
        ArcticEscrow.MilestoneInput[] memory ms = new ArcticEscrow.MilestoneInput[](count);
        for (uint256 i; i < count; ++i) {
            ms[i] = _approvalMs(uint128(bound(uint256(keccak256(abi.encode(seed, i))), 1, 5_000e6)));
        }
        uint256 total = _sum(ms);
        uint256 id = _create(ms, _splitTo(payee), address(0));
        _accept(id);

        uint256 releasedGross;
        for (uint256 i; i < count; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i, "op"))) % 3;
            if (r == 0) {
                vm.prank(payee);
                escrow.refundMilestone(id, i);
            } else {
                _deliver(id, i);
                if (r == 1) {
                    vm.prank(payer);
                    escrow.releaseMilestone(id, i);
                } else {
                    vm.warp(block.timestamp + REVIEW);
                    escrow.releaseMilestone(id, i);
                }
                releasedGross += ms[i].amount;
            }
            _assertSolvent();
        }

        ArcticEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.status), uint8(ArcticEscrow.DealStatus.Completed));
        assertEq(d.released, releasedGross);
        assertEq(uint256(d.released) + d.refunded, total);
        assertEq(usdc.balanceOf(payer), USDC_100K - releasedGross);
        assertEq(usdc.balanceOf(payee) + usdc.balanceOf(treasury), releasedGross);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.liabilities(), 0);
    }

    function testFuzz_PayerRefundGate(uint64 elapsed) public {
        elapsed = uint64(bound(elapsed, 0, 2 * uint256(DELIVER)));
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.warp(block.timestamp + elapsed);

        vm.prank(payer);
        if (elapsed > DELIVER) {
            escrow.refundMilestone(id, 0);
            assertEq(usdc.balanceOf(payer), USDC_100K);
        } else {
            vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotRefundable.selector, id, 0));
            escrow.refundMilestone(id, 0);
        }
    }

    function testFuzz_ReviewWindowGate(uint32 review, uint64 elapsed) public {
        review  = uint32(bound(review, 1 hours, 90 days));
        elapsed = uint64(bound(elapsed, 0, 2 * uint256(review)));

        vm.startPrank(payer);
        usdc.approve(address(escrow), USDC_1K);
        uint256 id = escrow.createDeal(payee, address(0), "D", _one(_approvalMs(USDC_1K)), _splitTo(payee), review);
        vm.stopPrank();
        _accept(id);
        _deliver(id, 0);
        vm.warp(block.timestamp + elapsed);

        vm.prank(stranger);
        if (elapsed >= review) {
            escrow.releaseMilestone(id, 0);
            assertEq(usdc.balanceOf(payee), _net(USDC_1K));
        } else {
            vm.expectRevert(abi.encodeWithSelector(ArcticEscrow.NotReleasable.selector, id, 0));
            escrow.releaseMilestone(id, 0);
        }
    }
}
