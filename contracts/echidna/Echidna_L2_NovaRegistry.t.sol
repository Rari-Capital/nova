// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "../L2_NovaRegistry.sol";
import "../mocks/MockCrossDomainMessenger.sol";
import "../mocks/MockERC20.sol";

contract Echidna_L2_NovaRegistry {
    L2_NovaRegistry internal registry;
    MockCrossDomainMessenger internal mockCrossDomainMessenger;
    MockERC20 internal mockETH;

    constructor() {
        mockCrossDomainMessenger = new MockCrossDomainMessenger();
        mockETH = new MockERC20();
        registry = new L2_NovaRegistry(address(mockETH), address(mockCrossDomainMessenger));
        registry.connectExecutionManager(address(1));
    }

    function should_always_be_able_connect_execution_manager(address newExecutionManager) public {
        registry.connectExecutionManager(newExecutionManager);

        assert(registry.L1_NovaExecutionManagerAddress() == newExecutionManager);
    }

    function requestExec_should_work_properly(
        address strategy,
        bytes calldata l1calldata,
        uint64 gasLimit,
        uint256 gasPrice,
        uint256 tip
    ) public {
        // Calculate how much wei the registry will bill us:
        uint256 weiOwed = (gasPrice * gasLimit) + tip;

        // Mint us some extra tokens if we need:
        uint256 currentBalance = mockETH.balanceOf(address(this));
        if (weiOwed > currentBalance) {
            mockETH.mint(weiOwed - currentBalance);
        }

        /// Approve the wei owed to the registry:
        mockETH.approve(address(registry), weiOwed);

        try
            registry.requestExec(strategy, l1calldata, gasLimit, gasPrice, tip, new L2_NovaRegistry.InputToken[](0))
        returns (bytes32 execHash) {
            assert(execHash == NovaExecHashLib.compute(registry.systemNonce(), strategy, l1calldata, gasPrice));

            assert(registry.getRequestCreator(execHash) == address(this));
            assert(registry.getRequestStrategy(execHash) == strategy);
            assert(keccak256(registry.getRequestCalldata(execHash)) == keccak256(l1calldata));
            assert(registry.getRequestGasLimit(execHash) == gasLimit);
            assert(registry.getRequestGasPrice(execHash) == gasPrice);
            assert(registry.getRequestTip(execHash) == tip);
            assert(registry.getRequestNonce(execHash) == registry.systemNonce());
            assert(registry.getRequestInputTokens(execHash).length == 0);
        } catch {
            assert(false);
        }
    }
}
