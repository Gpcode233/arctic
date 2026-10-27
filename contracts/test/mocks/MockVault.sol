// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockUSDC} from "./MockUSDC.sol";

/// @dev Minimal ERC-4626 mock vault.
///      yieldBps: extra yield on top of principal (e.g. 1000 = 10 %).
///      shortfallBps: loss on principal (e.g. 500 = 5 % loss).
///      reentrantTarget / reentrantCalldata: if set, vault's redeem() calls
///      the target with the given calldata to test reentrancy guard.
contract MockVault {
    MockUSDC public immutable underlying;

    /// @dev Shares are 1:1 with assets at deposit, then yield is added on redeem.
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    /// @dev Basis points of yield added on top of principal at redeem.
    uint16 public yieldBps;
    /// @dev Basis points of shortfall (loss) subtracted at redeem.
    uint16 public shortfallBps;

    /// @dev Reentrancy attack target
    address public reentrantTarget;
    bytes   public reentrantCalldata;

    constructor(address _usdc) {
        underlying = MockUSDC(_usdc);
    }

    function setYieldBps(uint16 bps) external   { yieldBps = bps; }
    function setShortfallBps(uint16 bps) external { shortfallBps = bps; }
    function setReentrantAttack(address target, bytes calldata data) external {
        reentrantTarget = target;
        reentrantCalldata = data;
    }

    // ── ERC-4626 minimal surface ──────────────────────────────────────────────

    function asset() external view returns (address) {
        return address(underlying);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        underlying.transferFrom(msg.sender, address(this), assets);
        shares = assets; // 1:1 at deposit
        sharesOf[receiver] += shares;
        totalShares += shares;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (yieldBps > 0) {
            return shares + (shares * yieldBps) / 10_000;
        }
        if (shortfallBps > 0) {
            uint256 loss = (shares * shortfallBps) / 10_000;
            return shares > loss ? shares - loss : 0;
        }
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256 assets) {
        require(sharesOf[owner_] >= shares, "MockVault: insufficient shares");
        sharesOf[owner_] -= shares;
        totalShares -= shares;

        assets = convertToAssets(shares);

        // Transfer assets to receiver
        underlying.transfer(receiver, assets);

        // Optionally attempt reentrancy AFTER transferring (state already updated)
        if (reentrantTarget != address(0)) {
            (bool ok,) = reentrantTarget.call(reentrantCalldata);
            // We don't care if it succeeds — the guard should have rejected it
            ok; // silence warning
        }
    }
}
