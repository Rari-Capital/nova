// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";

contract MockContract {
    function thisFunctionWillNotRevert() external pure {}

    function thisFunctionWillRevert() external pure {
        revert("Not a hard revert!");
    }

    function thisFunctionWillHardRevert() external view {
        L1_NovaExecutionManager(msg.sender).hardRevert();
    }
}
