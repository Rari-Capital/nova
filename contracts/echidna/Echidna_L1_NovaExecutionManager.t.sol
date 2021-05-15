// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";
import "../mocks/MockCrossDomainMessenger.sol";

contract Echidna_L1_NovaExecutionManager {
    L1_NovaExecutionManager internal executionManager;
    MockCrossDomainMessenger internal mockCrossDomainMessenger;

    constructor() {
        mockCrossDomainMessenger = new MockCrossDomainMessenger();
        executionManager = new L1_NovaExecutionManager(address(0), address(mockCrossDomainMessenger));
    }

    function transferFromRelayer_should_always_be_not_executable(address token, uint256 amount) public {
        try executionManager.transferFromRelayer(token, amount) {
            assert(false);
        } catch Error(string memory reason) {
            assert(keccak256(abi.encodePacked(reason)) == keccak256("NOT_EXECUTING"));
        }
    }

    function exec_should_not_affect_currentExecHash(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata
    ) public {
        executionManager.exec(nonce, strategy, l1calldata);

        assert(executionManager.currentExecHash() == "");
    }
}
