// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@eth-optimism/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";

interface iL2_NovaRegistry {
    function execCompleted(
        bytes32 execHash,
        address executor,
        address rewardRecipient,
        uint256 gasUsed,
        bool reverted
    ) external;
}

contract L1_NovaExecutionManager is OVM_CrossDomainEnabled {
    bytes32 immutable HARD_REVERT_HASH = keccak256("__NOVA__HARD__REVERT__");
    address immutable L2_NovaRegistry;

    constructor(address _L2_NovaRegistry, address _l1messenger)
        OVM_CrossDomainEnabled(_l1messenger)
    {
        L2_NovaRegistry = _L2_NovaRegistry;
    }

    function execWithRecipient(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata,
        uint32 xDomainMessageGasLimit,
        address l2Recipient
    ) public {
        uint256 startGas = gasleft();

        // Call the strategy.
        (bool success, bytes memory _returnData) = strategy.call(l1calldata);

        // TODO: CAN WE FURTHER OPTIMIZE SINCE WE KNOW HOW LONG WE WANT THE REVERT STRING TO BE?
        // If the call reverted, check if it's a hard revert:
        if (!success && _returnData.length >= 68) {
            // Isolate the revert message.
            assembly {
                _returnData := add(_returnData, 0x04)
            }

            // TODO: WILL THIS WORK? (_returnData is raw bytes not decoded)
            // Revert if this is a hard revert.
            require(keccak256(_returnData) != HARD_REVERT_HASH, "HARD_REVERT");
        }

        // Compute the execHash
        bytes32 execHash =
            keccak256(
                abi.encodePacked(nonce, strategy, l1calldata, tx.gasprice)
            );

        // Figure out how much gas this xDomain message is going to cost us.
        uint256 xDomainMessageGas =
            // TODO: Figure out how to estimate the calldata size before we have it. (replace 696969696969696969696969696969696969696969696969)
            (48 * 696969696969696969696969696969696969696969696969) +
                (xDomainMessageGasLimit / 32) +
                74000;

        // Figure out how much gas this call will take up in total.
        // (Constant function call gas) + (Gas diff after calls) + (the amount of gas that will be burned via enqueue + storage/other message overhead)
        uint256 gasUsed = 21396 + (startGas - gasleft()) + xDomainMessageGas;

        // Send message to unlock the bounty on L2.
        sendCrossDomainMessage(
            L2_NovaRegistry,
            abi.encodeWithSelector(
                iL2_NovaRegistry.execCompleted.selector,
                execHash,
                msg.sender,
                l2Recipient,
                gasUsed,
                !success
            ),
            xDomainMessageGasLimit
        );
    }

    function exec(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata,
        uint32 xDomainMessageGasLimit
    ) external {
        execWithRecipient(
            nonce,
            strategy,
            l1calldata,
            xDomainMessageGasLimit,
            msg.sender
        );
    }

    function hardRevert() external pure {
        revert("__NOVA__HARD__REVERT__");
    }

    function transferFromBot(address token, uint256 amount) external {
        // TODO
    }
}
