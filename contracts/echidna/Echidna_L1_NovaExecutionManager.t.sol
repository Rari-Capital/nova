// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {MockCrossDomainMessenger, iOVM_CrossDomainMessenger} from "../mocks/MockCrossDomainMessenger.sol";

import {L1_NovaExecutionManager, SigLib, IERC20} from "../L1_NovaExecutionManager.sol";

contract Echidna_L1_NovaExecutionManager {
    L1_NovaExecutionManager internal immutable executionManager;
    MockCrossDomainMessenger internal immutable mockCrossDomainMessenger;

    address internal constant L2_NovaRegistryAddress = address(1);

    constructor() {
        MockCrossDomainMessenger _mockCrossDomainMessenger = new MockCrossDomainMessenger();
        mockCrossDomainMessenger = _mockCrossDomainMessenger;
        executionManager = new L1_NovaExecutionManager(L2_NovaRegistryAddress, _mockCrossDomainMessenger, 0);
    }

    function transferFromRelayer_should_always_be_not_executable(address token, uint256 amount) external {
        try executionManager.transferFromRelayer(token, amount) {
            assert(false);
        } catch Error(string memory reason) {
            bytes32 hashedReason = keccak256(abi.encodePacked(reason));
            assert(hashedReason == keccak256("NO_ACTIVE_EXECUTION") || hashedReason == keccak256("NOT_CURRENT_STRATEGY"));
        }
    }

    function exec_should_not_affect_currentExecHash(
        uint256 nonce,
        address strategy,
        bytes memory l1Calldata,
        uint256 gasLimit,
        address recipient,
        uint256 deadline
    ) external {
        try executionManager.exec(nonce, strategy, l1Calldata, gasLimit, recipient, deadline) {
            assert(executionManager.currentExecHash() == executionManager.DEFAULT_EXECHASH());
            assert(executionManager.currentRelayer() == address(this));
            assert(executionManager.currentlyExecutingStrategy() == strategy);
        } catch {
            // If it reverted, it should be because either;
            // - the deadline was in the past
            // - strategy == executionManager
            // - recipient == address(0)
            // - the calldata had transferFrom as the sig
            // - the calldata had sendMessage as the sig
            bytes4 calldataSig = SigLib.fromCalldata(l1Calldata);
            assert(
                deadline < block.timestamp ||
                    recipient == address(0) ||
                    strategy == address(executionManager) ||
                    calldataSig == iOVM_CrossDomainMessenger.sendMessage.selector ||
                    calldataSig == IERC20.transferFrom.selector
            );
        }
    }
}
