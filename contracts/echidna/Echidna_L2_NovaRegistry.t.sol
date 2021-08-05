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
        (bytes32 execHash, uint256 preRequestBalance, ) = createRequest(strategy, l1Calldata, gasLimit, gasPrice, tip);

        try registry.unlockTokens(execHash, unlockDelay) {
            hevm.warp(block.timestamp + unlockDelay);

            try registry.withdrawTokens(execHash) {
                assert(mockETH.balanceOf(address(this)) == preRequestBalance);
            } catch {
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
        uint64 gasLimit,
        uint64 gasPrice,
        uint64 tip,
        uint64 gasDelta1,
        uint64 gasDelta2
    ) external {
        (bytes32 execHash, , ) = createRequest(strategy, l1Calldata, gasLimit, gasPrice, tip);

        mintAndApproveToRegistry(gasDelta1 * gasLimit);
        registry.speedUpRequest(execHash, gasPrice + gasDelta1);

        mintAndApproveToRegistry(gasDelta2 * gasLimit);
        try registry.speedUpRequest(execHash, gasPrice + gasDelta2) {
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
    )
        internal
        returns (
            bytes32 execHash,
            uint256 preRequestBalance,
            uint256 weiOwed
        )
    {
        weiOwed = (gasPrice * gasLimit) + tip;
        mintAndApproveToRegistry(weiOwed);

        preRequestBalance = mockETH.balanceOf(address(this));

        execHash = registry.requestExec(
            strategy,
            l1Calldata,
            gasLimit,
            gasPrice,
            tip,
            new L2_NovaRegistry.InputToken[](0)
        );

        assert(mockETH.balanceOf(address(this)) == (preRequestBalance - weiOwed));
    }

    function mintAndApproveToRegistry(uint256 amount) internal {
        uint256 preMintBalance = mockETH.balanceOf(address(this));
        if (amount > preMintBalance) {
            mockETH.mint(amount - preMintBalance);
        }

        mockETH.approve(address(registry), amount);
    }
}
