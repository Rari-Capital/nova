// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../L1_NovaExecutionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EvilExternalContract {
    function tryToStealRelayerTokens(
        address executionManager,
        address token,
        uint256 amount
    ) external {
        L1_NovaExecutionManager(executionManager).transferFromRelayer(token, amount);
    }
}

contract MockStrategy {
    EvilExternalContract immutable evilContract = new EvilExternalContract();

    uint256 public counter = 1;

    function thisFunctionWillNotRevert() external pure {}

    function thisFunctionWillModifyState() external {
        counter += 1;
    }

    function thisFunctionWillTransferFromRelayer(address token, uint256 amount) external {
        L1_NovaExecutionManager(msg.sender).transferFromRelayer(token, amount);
    }

    function thisFunctionWillTryToTransferFromRelayerOnAnArbitraryExecutionManager(
        address executionManager,
        address token,
        uint256 amount
    ) external {
        L1_NovaExecutionManager(executionManager).transferFromRelayer(token, amount);
    }

    function thisFunctionWillEmulateAMaliciousExternalContractTryingToStealRelayerTokens(address token, uint256 amount)
        external
    {
        evilContract.tryToStealRelayerTokens(msg.sender, token, amount);
    }

    function thisFunctionWillTryToReenterAndHardRevertIfFails() external {
        L1_NovaExecutionManager em = L1_NovaExecutionManager(msg.sender);

        try em.exec(0, address(0), "", address(0), 999999999999999999999) {} catch Error(string memory reason) {
            if (keccak256(abi.encodePacked(reason)) == keccak256("ALREADY_EXECUTING")) {
                // If the call reverted due to reentrancy, signal this with a hard revert.
                em.hardRevert();
            }
        }
    }

    function thisFunctionWillRevert() external pure {
        revert("Not a hard revert!");
    }

    function thisFunctionWillHardRevert() external view {
        L1_NovaExecutionManager(msg.sender).hardRevert();
    }
}
