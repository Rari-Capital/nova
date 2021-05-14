// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@eth-optimism/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";
import "./L2_NovaRegistry.sol";
import "./external/Multicall.sol";
import "./external/DSAuth.sol";

contract L1_NovaExecutionManager is DSAuth, OVM_CrossDomainEnabled, ReentrancyGuard, Multicall {
    /// @dev The revert message text used to cause a hard revert.
    string public constant HARD_REVERT_TEXT = "__NOVA__HARD__REVERT__";
    /// @dev The hash of the hard revert message.
    bytes32 private constant HARD_REVERT_HASH = keccak256(abi.encodeWithSignature("Error(string)", HARD_REVERT_TEXT));

    /// @dev The bytes length of an abi encoded execCompleted call.
    uint256 public constant execCompletedMessageBytesLength = 132;

    /// @dev The xDomainGasLimit to use for the call to execCompleted.
    uint32 public constant execCompletedGasLimit = 1_000_000;

    /// @dev The address of the L2_NovaRegistry to send cross domain messages to.
    address public immutable L2_NovaRegistryAddress;

    constructor(address _L2_NovaRegistryAddress, address _messenger) OVM_CrossDomainEnabled(_messenger) {
        L2_NovaRegistryAddress = _L2_NovaRegistryAddress;
    }

    /// @dev The execHash computed from the currently executing call to `exec`.
    /// @dev This will be reset after every execution.
    bytes32 public currentExecHash;
    /// @dev The address who called `exec`/`execWithRecipient`.
    /// @dev This will not be reset to address(0) after each execution completes.
    address public currentExecutor;
    /// @dev The address of the strategy that is currenlty being called.
    /// @dev This will not be reset to address(0) after each execution completes.
    address public currentlyExecutingStrategy;

    /// @notice Convience function that `execWithRecipient` with all relevant arguments and sets the l2Recipient to msg.sender.
    function exec(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata
    ) external {
        execWithRecipient(nonce, strategy, l1calldata, msg.sender);
    }

    /// @notice Executes a request and sends tip/inputs to a specific address.
    /// @param nonce The nonce of the request.
    /// @param strategy The strategy requested in the request.
    /// @param l1calldata The calldata associated with the request.
    /// @param l2Recipient The address of the account on L2 to recieve the tip/inputs.
    function execWithRecipient(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata,
        address l2Recipient
    ) public nonReentrant auth {
        uint256 startGas = gasleft();

        // Compute the execHash.
        bytes32 execHash = keccak256(abi.encodePacked(nonce, strategy, l1calldata, tx.gasprice));

        // Initialize execution context.
        currentExecHash = execHash;
        currentExecutor = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy.
        (bool success, bytes memory returnData) = strategy.call(l1calldata);

        // Revert if the strategy hard reverted.
        require(keccak256(returnData) != HARD_REVERT_HASH, "HARD_REVERT");

        // Reset execution context.
        // We reset only one of the execution context variables because it will cost us less gas to use a previously set storage slot on all future runs.
        delete currentExecHash;

        // Figure out how much gas this xDomain message is going to cost us.
        uint256 xDomainMessageGas =
            // ((estimated cost per calldata char) * (bytes length for an encoded call to execCompleted)) + ((cross domain gas limit) / (enqueue gas burn)) + (sendMessage overhead)
            (50 * execCompletedMessageBytesLength) + (execCompletedGasLimit / 32) + 74000;

        // Figure out how much gas this call will take up in total: (Constant function call gas) + (Gas diff after calls) + (the amount of gas that will be burned via enqueue + storage/other message overhead)
        uint256 gasUsed = 21396 + (startGas - gasleft()) + xDomainMessageGas;

        // Send message to unlock the bounty on L2.
        sendCrossDomainMessage(
            L2_NovaRegistryAddress,
            abi.encodeWithSelector(
                L2_NovaRegistry(L2_NovaRegistryAddress).execCompleted.selector,
                execHash,
                l2Recipient,
                gasUsed,
                !success
            ),
            execCompletedGasLimit
        );
    }

    /// @notice Transfers tokens from the relayer (the account that called execute) has approved to the execution manager for the currently executing strategy.
    /// @notice Can only be called by the currently executing strategy (if there is one at all).
    /// @notice Will trigger a hard revert if the correct amount of tokens are not approved when called.
    /// @param token The ER20-compliant token to transfer to the currently executing strategy.
    /// @param amount The amount of `token` (scaled by its decimals)  to transfer to the currently executing strategy.
    function transferFromRelayer(address token, uint256 amount) external nonReentrant auth {
        // Only the currently executing strategy is allowed to call this method.
        // Must check that the execHash is not empty first to make sure that there is an execution in-progress.
        require(currentExecHash.length > 0 && msg.sender == currentlyExecutingStrategy, HARD_REVERT_TEXT);

        // Transfer the token from the relayer the currently executing strategy (msg.sender is enforced to be the currentlyExecutingStrategy above).
        (bool success, bytes memory returndata) =
            address(token).call(
                // Encode a call to transferFrom.
                abi.encodeWithSelector(IERC20(token).transferFrom.selector, currentExecutor, msg.sender, amount)
            );

        // Hard revert if the transferFrom call reverted.
        require(success, HARD_REVERT_TEXT);

        // If it returned something, hard revert if it is not a postiive bool.
        if (returndata.length > 0) {
            if (returndata.length == 32) {
                // It returned a bool, hard revert if it is not a postiive bool.
                require(abi.decode(returndata, (bool)), HARD_REVERT_TEXT);
            } else {
                // It returned some data that was not a bool, let's hard revert.
                revert(HARD_REVERT_TEXT);
            }
        }
    }

    /// @notice Convience function that triggers a hard revert.
    function hardRevert() external pure {
        // Call revert with the hard revert text.
        revert(HARD_REVERT_TEXT);
    }
}
