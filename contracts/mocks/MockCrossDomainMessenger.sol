// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

contract MockCrossDomainMessenger {
    address public xDomainMessageSender;

    function sendMessage(
        address _target,
        bytes memory _message,
        uint32 _gasLimit
    ) external {
        uint256 startingGas = gasleft();
        uint256 gasToConsume = _gasLimit / 32;

        // Store the sender.
        xDomainMessageSender = msg.sender;

        // Make the actual call but don't check the return value because this needs to feel async.
        _target.call(_message);

        // Remove the sender.
        delete xDomainMessageSender;

        // Mimic enqueue gas burn (https://github.com/ethereum-optimism/optimism/blob/master/packages/contracts/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol)
        uint256 i;
        while (startingGas - gasleft() < gasToConsume) {
            i++;
        }
    }
}
