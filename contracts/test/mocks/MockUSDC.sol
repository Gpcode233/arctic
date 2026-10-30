// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal ERC-20 mock for USDC (6 decimals) with test knobs:
///      - blocked: transfers to these addresses revert (like a USDC blocklist)
///      - skimBps: transferFrom delivers less than requested (fee-on-transfer)
///      - callback: every transfer calls `callbackTarget` (reentrancy tests)
contract MockUSDC {
    string  public name     = "Mock USDC";
    string  public symbol   = "mUSDC";
    uint8   public decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    mapping(address => bool) public blocked;
    uint16  public skimBps;
    address public callbackTarget;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setBlocked(address who, bool b) external { blocked[who] = b; }
    function setSkimBps(uint16 bps) external { skimBps = bps; }
    function setCallback(address target) external { callbackTarget = target; }

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

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        uint256 skim = (amount * skimBps) / 10_000;
        _move(from, to, amount - skim);
        if (skim > 0) _move(from, address(0xdead), skim);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(!blocked[to] && !blocked[from], "MockUSDC: blocked");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        if (callbackTarget != address(0)) {
            (bool ok,) = callbackTarget.call(abi.encodeWithSignature("onTransfer()"));
            ok;
        }
    }
}
