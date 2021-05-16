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

    address internal constant L2_NovaRegistryAddress = address(1);

    constructor() {
        mockCrossDomainMessenger = new MockCrossDomainMessenger();
        mockETH = new MockERC20();
        registry = new L2_NovaRegistry(address(mockETH), address(mockCrossDomainMessenger));
        registry.connectExecutionManager(address(1));
    }

    function should_never_be_able_to_reconnect_execution_manager(address fake) public {
        try registry.connectExecutionManager(fake) {
            // If the call succeeded, something is wrong:
            assert(false);
        } catch Error(string memory reason) {
            /// If the called errored, it should be a ALREADY_INITIALIZED error. If not, something is wrong:
            assert(keccak256(abi.encodePacked(reason)) == keccak256("ALREADY_INITIALIZED"));
        }
    }
}
