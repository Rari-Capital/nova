// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {MockCrossDomainMessenger, iOVM_CrossDomainMessenger} from "../mocks/MockCrossDomainMessenger.sol";

import {L1_NovaExecutionManager, IERC20} from "../L1_NovaExecutionManager.sol";

contract Echidna_L1_NovaExecutionManager {
    L1_NovaExecutionManager internal executionManager;
    MockCrossDomainMessenger internal mockCrossDomainMessenger;

    address internal constant L2_NOVA_REGISTRY_ADDRESS = address(1);

    constructor() {
        mockCrossDomainMessenger = new MockCrossDomainMessenger();
        executionManager = new L1_NovaExecutionManager(L2_NOVA_REGISTRY_ADDRESS, 0, mockCrossDomainMessenger);
    }

    function should_always_be_able_to_update_gas_config(L1_NovaExecutionManager.GasConfig calldata newGasConfig) external {
        executionManager.updateGasConfig(newGasConfig);

        (uint64 calldataByteGasEstimate, uint96 missingGasEstimate, uint96 strategyCallGasBuffer) = executionManager.gasConfig();

        assert(newGasConfig.calldataByteGasEstimate == calldataByteGasEstimate);
        assert(newGasConfig.missingGasEstimate == missingGasEstimate);
        assert(newGasConfig.strategyCallGasBuffer == strategyCallGasBuffer);
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
            assert(
                deadline < block.timestamp ||
                    recipient == address(0) ||
                    strategy == address(executionManager) ||
                    strategy == address(mockCrossDomainMessenger) ||
                    strategy == address(executionManager.L1_NOVA_APPROVAL_ESCROW())
            );
        }
    }
}
