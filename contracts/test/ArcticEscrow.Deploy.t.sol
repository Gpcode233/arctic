// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ArcticEscrowBase} from "./ArcticEscrow.Base.t.sol";
import {ArcticEscrow}     from "../ArcticEscrow.sol";
import {Ownable}          from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable}         from "@openzeppelin/contracts/utils/Pausable.sol";

contract ArcticEscrowDeployTest is ArcticEscrowBase {

    // ── Constructor ───────────────────────────────────────────────────────────

    function test_Constructor_SetsState() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.treasury(), treasury);
        assertEq(escrow.feeBps(), FEE_BPS);
        assertEq(escrow.owner(), owner);
        assertEq(escrow.dealCount(), 0);
        assertEq(escrow.liabilities(), 0);
        assertFalse(escrow.paused());
    }

    function test_Constructor_RevertsZeroUsdc() public {
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        new ArcticEscrow(address(0), treasury, FEE_BPS, owner);
    }

    function test_Constructor_RevertsZeroTreasury() public {
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        new ArcticEscrow(address(usdc), address(0), FEE_BPS, owner);
    }

    function test_Constructor_RevertsUsdcNotContract() public {
        vm.expectRevert(ArcticEscrow.NotAContract.selector);
        new ArcticEscrow(makeAddr("eoa"), treasury, FEE_BPS, owner);
    }

    function test_Constructor_RevertsFeeTooHigh() public {
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        new ArcticEscrow(address(usdc), treasury, 101, owner);
    }

    function test_Constructor_RevertsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ArcticEscrow(address(usdc), treasury, FEE_BPS, address(0));
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function test_SetFeeBps() public {
        vm.prank(owner);
        escrow.setFeeBps(100);
        assertEq(escrow.feeBps(), 100);
    }

    function test_SetFeeBps_RevertsAboveMax() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.InvalidFee.selector);
        escrow.setFeeBps(101);
    }

    function test_SetFeeBps_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setFeeBps(10);
    }

    function test_SetTreasury() public {
        vm.prank(owner);
        escrow.setTreasury(alice);
        assertEq(escrow.treasury(), alice);
    }

    function test_SetTreasury_RevertsZero() public {
        vm.prank(owner);
        vm.expectRevert(ArcticEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
    }

    function test_SetTreasury_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setTreasury(stranger);
    }

    function test_FeeChange_DoesNotAffectLiveDeals() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.prank(owner);
        escrow.setFeeBps(100);

        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K)); // still 0.5 %
    }

    // ── Ownership is two-step ─────────────────────────────────────────────────

    function test_Ownership_TwoStepTransfer() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);
        assertEq(escrow.owner(), owner);
        assertEq(escrow.pendingOwner(), alice);

        vm.prank(alice);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), alice);
    }

    function test_Ownership_WrongAcceptorReverts() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        escrow.acceptOwnership();
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    function test_Pause_BlocksCreateOnly() public {
        uint256 id = _approvalDeal(USDC_1K, address(0));
        vm.prank(owner);
        escrow.pause();

        vm.startPrank(payer);
        usdc.approve(address(escrow), USDC_1K);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.createDeal(payee, address(0), "D", _one(_approvalMs(USDC_1K)), _splitTo(payee), REVIEW);
        vm.stopPrank();

        // Existing deals keep working
        _deliver(id, 0);
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), _net(USDC_1K));
    }

    function test_Unpause() public {
        vm.startPrank(owner);
        escrow.pause();
        escrow.unpause();
        vm.stopPrank();
        assertFalse(escrow.paused());
    }

    function test_Pause_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.pause();
    }
}
