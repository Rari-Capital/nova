// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

contract MockCrossDomainMessenger {
    struct xDomainMessage {
        address _target;
        bytes _message;
        uint32 _gasLimit;
        address sender;
    }

    xDomainMessage public currentMessage;

    function sendMessage(
        address _target,
        bytes memory _message,
        uint32 _gasLimit
    ) external {
        uint256 startingGas = gasleft();
        currentMessage = xDomainMessage(_target, _message, _gasLimit, msg.sender);

        // Mimic enqueue gas burn (https://github.com/ethereum-optimism/optimism/blob/master/packages/contracts/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol) + sendMessage overhead.
        uint256 gasToConsume = (_gasLimit / 32) + 74000;
        uint256 i;
        while (startingGas - gasleft() < gasToConsume) {
            i++;
        }
    }
}
