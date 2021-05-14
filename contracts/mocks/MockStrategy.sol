// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStrategy {
    uint256 public counter = 1;

    function thisFunctionWillNotRevert() external pure {}

    function thisFunctionWillModifyState() external {
        counter += 1;
    }

    function thisFunctionWillTransferFromRelayer(address token, uint256 amount) external {
        L1_NovaExecutionManager(msg.sender).transferFromRelayer(token, amount);
    }

    function thisFunctionWillRevert() external pure {
        revert("Not a hard revert!");
    }

    function thisFunctionWillHardRevert() external view {
        L1_NovaExecutionManager(msg.sender).hardRevert();
    }
}
