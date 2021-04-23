// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";

contract MockContract {
    uint256 public testNumber;

    function thisFunctionWillNotRevert() external {
        testNumber = 696969;
    }

    function thisFunctionWillRevert() external {
        testNumber = 1337;
        revert("Not a hard revert!");
    }

    function thisFunctionWillHardRevert() external {
        testNumber = 80085;
        L1_NovaExecutionManager(msg.sender).hardRevert();
    }
}
