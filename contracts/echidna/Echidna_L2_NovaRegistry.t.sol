// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "../L2_NovaRegistry.sol";
import "../mocks/MockCrossDomainMessenger.sol";
import "../mocks/MockERC20.sol";
import "./Hevm.sol";

contract Echidna_L2_NovaRegistry is HevmUser {
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

    function requestExec_and_unlock_and_withdraw_tokens_should_work(
        address strategy,
        bytes calldata l1calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        uint256 unlockDelay
    ) public {
        // Calculate how much wei the registry will bill us:
        uint256 weiOwed = (gasPrice * gasLimit) + tip;

        // Mint us some extra tokens if we need:
        uint256 preMintBalance = mockETH.balanceOf(address(this));
        if (weiOwed > preMintBalance) {
            mockETH.mint(weiOwed - preMintBalance);
        }
        // Approve the wei owed to the registry:
        mockETH.approve(address(registry), weiOwed);

        // Calculate how much ETH we have now before the registry consumes it:
        uint256 preRequestBalance = mockETH.balanceOf(address(this));

        // Make the request:
        bytes32 execHash =
            registry.requestExec(strategy, l1calldata, gasLimit, gasPrice, tip, new L2_NovaRegistry.InputToken[](0));

        // Ensure that balance properly decreased.
        assert(mockETH.balanceOf(address(this)) == (preRequestBalance - weiOwed));

        // Attempt to unlock tokens.
        try registry.unlockTokens(execHash, unlockDelay) {
            // Time travel to when the tokens unlock:
            hevm.warp(block.timestamp + unlockDelay);

            // Attempt to withdraw tokens:
            try registry.withdrawTokens(execHash) {} catch {
                // This should not revert, if it does something is wrong.
                assert(false);
            }

            // Assert after withdrawing that our balance did not change.
            assert(mockETH.balanceOf(address(this)) == preRequestBalance);
        } catch {
            // This should only revert if the delay would cause overflow or is below the min.
            assert(
                (block.timestamp + unlockDelay) < block.timestamp || registry.MIN_UNLOCK_DELAY_SECONDS() > unlockDelay
            );
        }
    }
}
