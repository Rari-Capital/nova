// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";
import "../mocks/MockCrossDomainMessenger.sol";

contract Echidna_L1_NovaExecutionManager {
    L1_NovaExecutionManager internal immutable executionManager;
    MockCrossDomainMessenger internal immutable mockCrossDomainMessenger;

    address internal constant L2_NovaRegistryAddress = address(1);

    constructor() {
        MockCrossDomainMessenger _mockCrossDomainMessenger = new MockCrossDomainMessenger();
        mockCrossDomainMessenger = _mockCrossDomainMessenger;
        executionManager = new L1_NovaExecutionManager(L2_NovaRegistryAddress, address(_mockCrossDomainMessenger));
    }

    function transferFromRelayer_should_always_be_not_executable(address token, uint256 amount) public {
        try executionManager.transferFromRelayer(token, amount) {
            // If the call succeeded, something is wrong:
            assert(false);
        } catch Error(string memory reason) {
            /// If the called errored, it should be a NOT_EXECUTING error. If not, something is wrong:
            assert(keccak256(abi.encodePacked(reason)) == keccak256("NOT_EXECUTING"));
        }
    }

    function exec_should_not_affect_currentExecHash_and_should_send_an_xDomainMessage(
        uint256 nonce,
        address strategy,
        bytes calldata l1calldata,
        address recipient,
        uint256 deadline
    ) public {
        try executionManager.exec(nonce, strategy, l1calldata, recipient, deadline) {
            // ExecHash should always be reset:
            assert(executionManager.currentExecHash() == "");

            // Relayer should be us and not reset:
            assert(executionManager.currentRelayer() == address(this));

            // xDomain constants should always be as expected:
            assert(mockCrossDomainMessenger.latestTarget() == L2_NovaRegistryAddress);
            assert(mockCrossDomainMessenger.latestSender() == address(executionManager));
            assert(mockCrossDomainMessenger.latestGasLimit() == executionManager.EXEC_COMPLETED_MESSAGE_GAS_LIMIT());
        } catch {
            // If it reverted, it should be because either: The deadline was in the past or strategy == mockCrossDomainMessenger.
            // If not, something is wrong:
            assert(deadline < block.timestamp || strategy == address(mockCrossDomainMessenger));
        }
    }
}
