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
    using SafeERC20 for IERC20;

    /// @dev The hash of the hard revert message.
    bytes32 private immutable HARD_REVERT_HASH =
        keccak256("__NOVA__HARD__REVERT__");

    /// @dev The address of the L2_NovaRegistry to send cross domain messages to.
    address private L2_NovaRegistry;

    /// @dev The address of the strategy that is currenlty being called.
    address private currentlyExecutingStrategy;
    /// @dev The address who called `exec`/`execWithRecipient`.
    address private currentExecutor;

    constructor(address _l1messenger) OVM_CrossDomainEnabled(_l1messenger) {}

    function init(address _L2_NovaRegistry) external {
        require(L2_NovaRegistry == address(0), "ALREADY_INITIALIZED");
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

        // Initialize execution context.
        currentExecutor = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy.
        (bool success, bytes memory returnData) = strategy.call(l1calldata);

        // Revert if the strategy hard reverted.
        require(!success && isHardRevert(returnData), "HARD_REVERT");

        // Reset execution context.
        currentlyExecutingStrategy = address(0);
        currentExecutor = address(0);

        // Compute the execHash.
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

        // Figure out how much gas this call will take up in total: (Constant function call gas) + (Gas diff after calls) + (the amount of gas that will be burned via enqueue + storage/other message overhead)
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
        // Only the currently executing strategy is allowed to call this method.
        require(
            msg.sender == currentlyExecutingStrategy,
            "NOT_CURRENTLY_EXECUTING"
        );

        // Transfer the token from the calling bot the currently executing strategy (msg.sender is enforced to be the currentlyExecutingStrategy above).
        IERC20(token).safeTransferFrom(currentExecutor, msg.sender, amount);
    }

    function isHardRevert(bytes memory returnData) private view returns (bool) {
        // TODO: CAN WE FURTHER OPTIMIZE SINCE WE KNOW HOW LONG WE WANT THE REVERT STRING TO BE?
        if (returnData.length >= 68) {
            // Isolate the revert message.
            assembly {
                returnData := add(returnData, 0x04)
            }

            // TODO: WILL THIS WORK? (returnData is raw bytes not decoded)
            return keccak256(returnData) != HARD_REVERT_HASH;
        } else {
            return false;
        }
    }
}
