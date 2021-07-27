// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {HevmHelper} from "./Hevm.sol";

import {MockERC20} from "../mocks/MockERC20.sol";
import {MockCrossDomainMessenger} from "../mocks/MockCrossDomainMessenger.sol";

import {L2_NovaRegistry} from "../L2_NovaRegistry.sol";

contract Echidna_L2_NovaRegistry is HevmHelper {
    L2_NovaRegistry internal immutable registry;
    MockCrossDomainMessenger internal immutable mockCrossDomainMessenger;
    MockERC20 internal immutable mockETH;

    constructor() {
        MockCrossDomainMessenger _mockCrossDomainMessenger = new MockCrossDomainMessenger();
        mockCrossDomainMessenger = _mockCrossDomainMessenger;
        MockERC20 _mockETH = new MockERC20();
        mockETH = _mockETH;

        registry = new L2_NovaRegistry(address(_mockETH), _mockCrossDomainMessenger);
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
        // Calculate how much wei the registry will bill us:
        uint256 weiOwed = (gasPrice * gasLimit) + tip;

        // Mint and approve the right amount of tokens to the registry.
        mintAndApproveToRegistry(weiOwed);

        // Calculate how much ETH we have now before the registry consumes it:
        uint256 preRequestBalance = mockETH.balanceOf(address(this));

        // Make the request:
        bytes32 execHash =
            registry.requestExec(strategy, l1Calldata, gasLimit, gasPrice, tip, new L2_NovaRegistry.InputToken[](0));

        // Ensure that our balance properly decreased.
        assert(mockETH.balanceOf(address(this)) == (preRequestBalance - weiOwed));

        // Attempt to unlock tokens.
        try registry.unlockTokens(execHash, unlockDelay) {
            // Time travel to when the tokens unlock:
            hevm.warp(block.timestamp + unlockDelay);

            // Attempt to withdraw tokens:
            try registry.withdrawTokens(execHash) {
                // Assert after withdrawing that our balance did not change.
                assert(mockETH.balanceOf(address(this)) == preRequestBalance);
            } catch {
                // This should not revert, if it does something is wrong.
                assert(false);
            }
        } catch {
            // This should only revert if the delay would cause overflow or is below the min.
            assert(
                (block.timestamp + unlockDelay) < block.timestamp || registry.MIN_UNLOCK_DELAY_SECONDS() > unlockDelay
            );
        }
    }

    function speeding_up_a_request_multiple_times_should_fail(
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        uint256 gasDelta1,
        uint256 gasDelta2
    ) external {
        // Mint and approve the right amount of tokens to the registry.
        mintAndApproveToRegistry((gasPrice * gasLimit) + tip);

        bytes32 execHash =
            // Make a starting request.
            registry.requestExec(strategy, l1Calldata, gasLimit, gasPrice, tip, new L2_NovaRegistry.InputToken[](0));

        // Mint and approve the right amount of tokens to the registry.
        mintAndApproveToRegistry(gasDelta1 * gasLimit);

        // Speed up the starting request.
        registry.speedUpRequest(execHash, gasPrice + gasDelta1);

        // Mint and approve the right amount of tokens to the registry.
        mintAndApproveToRegistry(gasDelta2 * gasLimit);

        // Try to speed up the starting request again.
        try registry.speedUpRequest(execHash, gasPrice + gasDelta2) {
            // This should always revert, if not something is wrong.
            assert(false);
        } catch {}
    }

    function mintAndApproveToRegistry(uint256 amount) internal {
        // Mint us some extra tokens if we need:
        uint256 preMintBalance = mockETH.balanceOf(address(this));
        if (amount > preMintBalance) {
            mockETH.mint(amount - preMintBalance);
        }

        // Approve the wei owed to the registry:
        mockETH.approve(address(registry), amount);
    }
}
