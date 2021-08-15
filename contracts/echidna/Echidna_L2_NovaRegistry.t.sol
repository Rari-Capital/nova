// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {HevmHelper} from "./Hevm.sol";

import {MockERC20} from "../mocks/MockERC20.sol";
import {MockCrossDomainMessenger} from "../mocks/MockCrossDomainMessenger.sol";

import {L2_NovaRegistry} from "../L2_NovaRegistry.sol";

contract Echidna_L2_NovaRegistry is HevmHelper {
    L2_NovaRegistry internal registry;
    MockCrossDomainMessenger internal mockCrossDomainMessenger;

    constructor() {
        mockCrossDomainMessenger = new MockCrossDomainMessenger();
        registry = new L2_NovaRegistry(mockCrossDomainMessenger);
    }

    function should_always_be_able_connect_execution_manager(address newExecutionManager) external {
        registry.connectExecutionManager(newExecutionManager);

        assert(registry.L1_NovaExecutionManagerAddress() == newExecutionManager);
    }

    function requestExec_and_unlock_and_withdraw_tokens_should_work(
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        uint256 unlockDelay
    ) external {
        bytes32 execHash = createRequest(strategy, l1Calldata, gasLimit, gasPrice, tip);

        try registry.unlockTokens(execHash, unlockDelay) {
            hevm.warp(block.timestamp + unlockDelay);

            try registry.withdrawTokens(execHash) {} catch {
                assert(false);
            }
        } catch {
            // This should only revert if the delay would cause overflow or is below the min.
            assert((block.timestamp + unlockDelay) < block.timestamp || registry.MIN_UNLOCK_DELAY_SECONDS() > unlockDelay);
        }
    }

    function speeding_up_a_request_multiple_times_should_fail(
        address strategy,
        bytes calldata l1Calldata,
        uint64 gasLimit,
        uint64 gasPrice,
        uint64 tip,
        uint64 gasDelta1,
        uint64 gasDelta2
    ) external {
        bytes32 execHash = createRequest(strategy, l1Calldata, gasLimit, gasPrice, tip);

        registry.speedUpRequest{value: gasDelta1 * gasLimit}(execHash, gasPrice + gasDelta1);

        try registry.speedUpRequest{value: gasDelta2 * gasLimit}(execHash, gasPrice + gasDelta2) {
            assert(false);
        } catch {}
    }

    /*///////////////////////////////////////////////////////////////
                            INTERNAL UTILS
    //////////////////////////////////////////////////////////////*/

    function createRequest(
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip
    ) internal returns (bytes32) {
        return
            registry.requestExec{value: (gasPrice * gasLimit) + tip}(
                strategy,
                l1Calldata,
                gasLimit,
                gasPrice,
                tip,
                new L2_NovaRegistry.InputToken[](0)
            );
    }
}
