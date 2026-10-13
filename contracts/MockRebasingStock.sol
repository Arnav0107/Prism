// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockRebasingStock
 * @notice xStocks-like rebasing ERC-20 token where balances scale via an owner-settable multiplier.
 * @dev Balances are stored as internal shares and multiplied by multiplierBps / 10_000.
 *      Notice: Integer division and rounding across multiplier changes can result in 1-2 wei precision variance.
 */
contract MockRebasingStock is IERC20, Ownable {
    string public constant name = "Mock Rebasing Stock";
    string public constant symbol = "mR-STOCK";
    uint8 public constant decimals = 18;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public multiplierBps = 10_000; // 1.0x initial scale

    uint256 private _totalShares;
    mapping(address => uint256) private _shares;
    mapping(address => mapping(address => uint256)) private _allowances;

    event MultiplierUpdated(uint256 oldMultiplierBps, uint256 newMultiplierBps);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Updates the balance rebase multiplier (Owner only).
     * @dev E.g. 10_050 represents a +0.5% dividend rebase.
     * @param newMultiplierBps New multiplier in basis points.
     */
    function setMultiplierBps(uint256 newMultiplierBps) external onlyOwner {
        require(newMultiplierBps > 0, "Invalid multiplier");
        emit MultiplierUpdated(multiplierBps, newMultiplierBps);
        multiplierBps = newMultiplierBps;
    }

    function totalSupply() public view override returns (uint256) {
        return (_totalShares * multiplierBps) / BPS_DENOMINATOR;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return (_shares[account] * multiplierBps) / BPS_DENOMINATOR;
    }

    function sharesOf(address account) external view returns (uint256) {
        return _shares[account];
    }

    function totalShares() external view returns (uint256) {
        return _totalShares;
    }

    function mint(address to, uint256 amount) external {
        uint256 sharesToMint = (amount * BPS_DENOMINATOR) / multiplierBps;
        _totalShares += sharesToMint;
        _shares[to] += sharesToMint;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _allowances[from][msg.sender] = currentAllowance - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");

        // Convert token amount to shares
        uint256 sharesToTransfer = (amount * BPS_DENOMINATOR) / multiplierBps;
        require(_shares[from] >= sharesToTransfer, "ERC20: transfer amount exceeds balance");

        unchecked {
            _shares[from] -= sharesToTransfer;
            _shares[to] += sharesToTransfer;
        }

        emit Transfer(from, to, amount);
    }
}
