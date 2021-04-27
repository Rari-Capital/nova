// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@eth-optimism/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";
import "./L2_NovaRegistry.sol";

contract L1_NovaExecutionManager is OVM_CrossDomainEnabled {
    using SafeERC20 for IERC20;

    /// @dev The revert message text used to cause a hard revert.
    string private constant HARD_REVERT_TEXT = "__NOVA__HARD__REVERT__";
    /// @dev The hash of the hard revert message.
    bytes32 private constant HARD_REVERT_HASH = keccak256(abi.encodeWithSignature("Error(string)", HARD_REVERT_TEXT));

    /// @dev The bytes length of an abi encoded execCompleted call.
    uint256 public constant execCompletedMessageBytesLength = 164;

    /// @dev The address of the L2_NovaRegistry to send cross domain messages to.
    address public immutable L2_NovaRegistryAddress;

    /// @notice Maps execHashes to a boolean indicating whether the corresponding request has already been executed.
    mapping(bytes32 => bool) public executed;

    /// @dev The execHash computed from the currently executing call to `exec`.
    /// @dev This will be reset after every execution.
    bytes32 public currentExecHash;
    /// @dev The address who called `exec`/`execWithRecipient`.
    /// @dev This will not be reset to address(0) after each execution completes.
    address public currentExecutor;
    /// @dev The address of the strategy that is currenlty being called.
    /// @dev This will not be reset to address(0) after each execution completes.
    address public currentlyExecutingStrategy;

    constructor(address _L2_NovaRegistryAddress, address _messenger) OVM_CrossDomainEnabled(_messenger) {
        L2_NovaRegistryAddress = _L2_NovaRegistryAddress;
    }

    function execWithRecipient(
        uint72 nonce,
        address strategy,
        bytes calldata l1calldata,
        uint32 xDomainMessageGasLimit,
        address l2Recipient
    ) public {
        uint256 startGas = gasleft();

        // Compute the execHash.
        bytes32 execHash = keccak256(abi.encodePacked(nonce, strategy, l1calldata, tx.gasprice));

        // Prevent double executing.
        require(!executed[execHash], "ALREADY_EXECUTED");

        // Initialize execution context.
        currentExecHash = execHash;
        currentExecutor = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy.
        (bool success, bytes memory returnData) = strategy.call(l1calldata);

        // Revert if the strategy hard reverted.
        require(success || !isHardRevert(returnData), "HARD_REVERT");

        // Mark the request as executed.
        executed[execHash] = true;

        // Reset execution context.
        // We reset only one of the execution context variables because it will cost us less gas to use a previously set storage slot on all future runs.
        delete currentExecHash;

        // Figure out how much gas this xDomain message is going to cost us.
        uint256 xDomainMessageGas =
            // ((estimated cost per calldata char) * (bytes length for an encoded call to execCompleted)) + ((cross domain gas limit) / (enqueue gas burn)) + (sendMessage overhead)
            (48 * execCompletedMessageBytesLength) + (xDomainMessageGasLimit / 32) + 74000;

        // Figure out how much gas this call will take up in total: (Constant function call gas) + (Gas diff after calls) + (the amount of gas that will be burned via enqueue + storage/other message overhead)
        uint256 gasUsed = 21396 + (startGas - gasleft()) + xDomainMessageGas;

        // Send message to unlock the bounty on L2.
        sendCrossDomainMessage(
            L2_NovaRegistryAddress,
            abi.encodeWithSelector(
                L2_NovaRegistry(L2_NovaRegistryAddress).execCompleted.selector,
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
        execWithRecipient(nonce, strategy, l1calldata, xDomainMessageGasLimit, msg.sender);
    }

    function hardRevert() external pure {
        // Call revert with the hard revert text.
        revert(HARD_REVERT_TEXT);
    }

    function transferFromBot(address token, uint256 amount) external {
        // Only the currently executing strategy is allowed to call this method.
        // Must check that the execHash is not empty first to make sure that there is an execution in-progress.
        require(currentExecHash.length > 0 && msg.sender == currentlyExecutingStrategy, "NOT_CURRENTLY_EXECUTING");

        // Transfer the token from the calling bot the currently executing strategy (msg.sender is enforced to be the currentlyExecutingStrategy above).
        IERC20(token).safeTransferFrom(currentExecutor, msg.sender, amount);
    }

    function isHardRevert(bytes memory returnData) private pure returns (bool) {
        // We know the reverting with the HARD_REVERT_TEXT results in returnData with a length of 100.
        if (returnData.length != 100) return false;

        // Check if the revert data matches the HARD_REVERT_HASH.
        return keccak256(returnData) == HARD_REVERT_HASH;
    }
}
