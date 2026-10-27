// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal ERC-20 mock for USDC (6 decimals).
///      Supports mint, normal transfers, and an optional revert-on-transfer
///      for a specific address (to test SplitFailed fallback).
contract MockUSDC {
    string  public name     = "Mock USDC";
    string  public symbol   = "mUSDC";
    uint8   public decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev If set, calls to transfer/transferFrom targeting this address revert.
    address public revertOnTransferTo;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setRevertOnTransferTo(address target) external {
        revertOnTransferTo = target;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // forceApprove alias used by SafeERC20
    function forceApprove(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == revertOnTransferTo) revert("MockUSDC: blocked recipient");
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == revertOnTransferTo) revert("MockUSDC: blocked recipient");
        require(balanceOf[from] >= amount, "insufficient balance");
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
