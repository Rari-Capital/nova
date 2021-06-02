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
        uint64 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        uint256 unlockDelay
    ) public {
        require(
            // Don't permit unlockDelays that are below the min or cause overflows.
            unlockDelay > registry.MIN_UNLOCK_DELAY_SECONDS() && (block.timestamp + unlockDelay) >= block.timestamp
        );

        // Calculate how much wei the registry will bill us:
        uint256 weiOwed = (gasPrice * gasLimit) + tip;

        // Mint us some extra tokens if we need:
        uint256 startingBalance = mockETH.balanceOf(address(this));
        if (weiOwed > startingBalance) {
            mockETH.mint(weiOwed - startingBalance);
        }

        /// Approve the wei owed to the registry:
        mockETH.approve(address(registry), weiOwed);

        try
            registry.requestExec(strategy, l1calldata, gasLimit, gasPrice, tip, new L2_NovaRegistry.InputToken[](0))
        returns (bytes32 execHash) {
            // Make sure the request worked.
            assert(execHash == NovaExecHashLib.compute(registry.systemNonce(), strategy, l1calldata, gasPrice));
            assert(registry.getRequestCreator(execHash) == address(this));
            assert(registry.getRequestStrategy(execHash) == strategy);
            assert(keccak256(registry.getRequestCalldata(execHash)) == keccak256(l1calldata));
            assert(registry.getRequestGasLimit(execHash) == gasLimit);
            assert(registry.getRequestGasPrice(execHash) == gasPrice);
            assert(registry.getRequestTip(execHash) == tip);
            assert(registry.getRequestNonce(execHash) == registry.systemNonce());
            assert(registry.getRequestInputTokens(execHash).length == 0);

            // Unlock tokens.
            try registry.unlockTokens(execHash, unlockDelay) {} catch {
                // This should not revert, if it does something is wrong.
                assert(false);
            }

            // Time travel to when the tokens unlock.
            hevm.warp(block.timestamp + unlockDelay);

            // Withdraw tokens.
            try registry.withdrawTokens(execHash) {} catch {
                // This should not revert, if it does something is wrong.
                assert(false);
            }

            // There should be no ETH left in the registry.
            assert(mockETH.balanceOf(address(registry)) == 0);
        } catch {
            // This should not revert, if it does something is wrong.
            assert(false);
        }
    }
}
