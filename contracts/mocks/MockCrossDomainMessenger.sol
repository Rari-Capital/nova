// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@eth-optimism/contracts/iOVM/bridge/messaging/iOVM_CrossDomainMessenger.sol";

contract MockCrossDomainMessenger is iOVM_CrossDomainMessenger {
    uint256 constant SEND_MESSAGE_GAS_TO_CONSUME = 151500;

    function sendMessage(
        address,
        bytes memory,
        uint32
    ) external view override {
        // Burn gas to make this function consume as
        // much gas as a real sendMessage call would.
        uint256 i;
        uint256 startingGas = gasleft();
        while (startingGas - gasleft() < SEND_MESSAGE_GAS_TO_CONSUME) {
            i++;
        }
    }

    address public override xDomainMessageSender;

    function relayMessage(
        address target,
        bytes calldata message,
        address sender
    ) external {
        xDomainMessageSender = sender;
        (bool success, bytes memory result) = target.call(message);
        delete xDomainMessageSender;

        require(success, getRevertMsg(result));
    }

    function getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Slice the sighash.
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string)); // All that remains is the revert string
    }
}
