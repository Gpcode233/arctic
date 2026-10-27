// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEscrow {
    function releaseMilestone(uint256 dealId, uint256 index) external;
}

/// @dev Attacker contract that attempts to reenter releaseMilestone during
///      the vault's redeem callback.  The ReentrancyGuard on ArcticEscrow
///      must reject the second call.
contract ReentrantAttacker {
    IEscrow public escrow;
    uint256 public dealId;
    uint256 public index;

    bool public attackFired;
    bool public attackReverted;

    constructor(address _escrow) {
        escrow = IEscrow(_escrow);
    }

    function setTarget(uint256 _dealId, uint256 _index) external {
        dealId = _dealId;
        index  = _index;
    }

    /// @dev Called by MockVault.redeem() to simulate reentrancy.
    fallback() external {
        if (!attackFired) {
            attackFired = true;
            try escrow.releaseMilestone(dealId, index) {
                // Should NOT succeed — reentrancy guard must block it
            } catch {
                attackReverted = true;
            }
        }
    }

    receive() external payable {}
}
