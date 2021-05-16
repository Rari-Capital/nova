// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

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
}
