// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Called by MockUSDC on every transfer; tries to reenter the escrow with
///      preset calldata. ArcticEscrow's ReentrancyGuard must reject it.
contract ReentrantAttacker {
    address public escrow;
    bytes   public payload;
    bool    public attempted;
    bool    public succeeded;

    constructor(address _escrow) { escrow = _escrow; }

    function arm(bytes calldata data) external {
        payload   = data;
        attempted = false;
        succeeded = false;
    }

    function onTransfer() external {
        if (attempted || payload.length == 0) return;
        attempted = true;
        (bool ok,) = escrow.call(payload);
        succeeded = ok;
    }
}
