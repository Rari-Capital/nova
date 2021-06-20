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
import "./libraries/NovaExecHashLib.sol";

contract L1_NovaExecutionManager is DSAuth, OVM_CrossDomainEnabled, ReentrancyGuard, Multicall {
    /*///////////////////////////////////////////////////////////////
                            HARD REVERT CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @dev The revert message text used to cause a hard revert.
    string public constant HARD_REVERT_TEXT = "__NOVA__HARD__REVERT__";
    /// @dev The hash of the hard revert message.
    bytes32 internal constant HARD_REVERT_HASH = keccak256(abi.encodeWithSignature("Error(string)", HARD_REVERT_TEXT));

    /*///////////////////////////////////////////////////////////////
                          GAS ESTIMATION CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @dev The amount of gas to assume for each byte of calldata.
    uint32 public constant AVERAGE_GAS_PER_CALLDATA_BYTE = 13;

    /// @dev The bytes length of an abi encoded execCompleted call.
    uint256 public constant EXEC_COMPLETED_MESSAGE_BYTES_LENGTH = 132;

    /// @dev The xDomainGasLimit to use for the call to execCompleted.
    uint32 public constant EXEC_COMPLETED_MESSAGE_GAS_LIMIT = 1_000_000;

    /*///////////////////////////////////////////////////////////////
                             REGISTRY ADDRESS
    //////////////////////////////////////////////////////////////*/

    /// @dev The address of the L2_NovaRegistry to send cross domain messages to.
    address public immutable L2_NovaRegistryAddress;

    constructor(address _L2_NovaRegistryAddress, address _messenger) OVM_CrossDomainEnabled(_messenger) {
        L2_NovaRegistryAddress = _L2_NovaRegistryAddress;
    }

    /*///////////////////////////////////////////////////////////////
                        EXECUTION CONTEXT CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The 'default' value for `currentExecHash`.
    /// @notice Outside of an active `exec` call `currentExecHash` will always equal DEFAULT_EXECHASH.
    bytes32 public constant DEFAULT_EXECHASH = 0xFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEF;

    /*///////////////////////////////////////////////////////////////
                        EXECUTION CONTEXT STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @dev The execHash computed from the currently executing call to `exec`.
    /// @dev This will be reset to DEFAULT_EXECHASH after each execution completes.
    bytes32 public currentExecHash = DEFAULT_EXECHASH;
    /// @dev The address who called `exec`.
    /// @dev This will not be reset after each execution completes.
    address public currentRelayer;
    /// @dev The address of the strategy that is currently being called.
    /// @dev This will not be reset after each execution completes.
    address internal currentlyExecutingStrategy;

    /*///////////////////////////////////////////////////////////////
                           STATEFUL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Executes a request and sends tip/inputs to a specific address.
    /// @param nonce The nonce of the request.
    /// @param strategy The strategy requested in the request.
    /// @param l1calldata The calldata associated with the request.
    /// @param l2Recipient The address of the account on L2 to recieve the tip/inputs.
    /// @param deadline Timestamp after which the transaction will revert.
    function exec(
        uint256 nonce,
        address strategy,
        bytes calldata l1calldata,
        address l2Recipient,
        uint256 deadline
    ) external nonReentrant {
        uint256 startGas = gasleft();

        // Validte preconditions.
        require(block.timestamp <= deadline, "PAST_DEADLINE");
        require(isAuthorized(msg.sender, msg.sig), "ds-auth-unauthorized");

        // Compute the execHash.
        bytes32 execHash =
            NovaExecHashLib.compute({nonce: nonce, strategy: strategy, l1calldata: l1calldata, gasPrice: tx.gasprice});

        // Initialize execution context.
        currentExecHash = execHash;
        currentRelayer = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy.
        (bool success, bytes memory returnData) = strategy.call(l1calldata);

        // Revert if the strategy hard reverted.
        require(keccak256(returnData) != HARD_REVERT_HASH, HARD_REVERT_TEXT);

        // Reset currentExecHash to default so `transferFromRelayer` becomes uncallable again.
        currentExecHash = DEFAULT_EXECHASH;

        // Estimate how much gas the relayer will have paid (not accounting for refunds):
        uint256 gasUsedEstimate =
            10000 + /* Constant function call gas (21,000) + Auth and Reentrancy Guard gas (4,000) - Delete currentExecHash refund (15,000) */
                (msg.data.length * AVERAGE_GAS_PER_CALLDATA_BYTE) + /* Calldata cost estimate */
                (startGas - gasleft()) + /* Gas used so far */
                (50 * EXEC_COMPLETED_MESSAGE_BYTES_LENGTH) + /* Cost per message calldata char * Message bytes length */
                (EXEC_COMPLETED_MESSAGE_GAS_LIMIT / 32) + /* Cross domain gas limit / Enqueue gas burn */
                74000; /* sendMessage/enqueue overhead */

        // Send message to unlock the bounty on L2.
        sendCrossDomainMessage(
            L2_NovaRegistryAddress,
            abi.encodeWithSelector(
                L2_NovaRegistry(L2_NovaRegistryAddress).execCompleted.selector,
                // Computed execHash:
                execHash,
                // The reward recipient on L2:
                l2Recipient,
                // Did the call revert:
                !success,
                // Estimated gas used in total:
                gasUsedEstimate
            ),
            EXEC_COMPLETED_MESSAGE_GAS_LIMIT
        );
    }

    /// @notice Transfers tokens from the relayer (the account that called execute) has approved to the execution manager for the currently executing strategy.
    /// @notice Can only be called by the currently executing strategy (if there is one at all).
    /// @notice Will trigger a hard revert if the correct amount of tokens are not approved when called.
    /// @param token The ER20-compliant token to transfer to the currently executing strategy.
    /// @param amount The amount of `token` (scaled by its decimals)  to transfer to the currently executing strategy.
    function transferFromRelayer(address token, uint256 amount) external auth {
        // Only the currently executing strategy is allowed to call this function.
        require(msg.sender == currentlyExecutingStrategy, "NOT_CURRENT_STRATEGY");

        // Ensure currentExecHash is not set to DEFAULT_EXECHASH as otherwise
        // a strategy could call this function outside of an active execution.
        require(currentExecHash != DEFAULT_EXECHASH, "NO_ACTIVE_EXECUTION");

        // Transfer the token from the relayer the currently executing strategy (msg.sender is enforced to be the currentlyExecutingStrategy above).
        (bool success, bytes memory returndata) =
            address(token).call(
                // Encode a call to transferFrom.
                abi.encodeWithSelector(IERC20(token).transferFrom.selector, currentRelayer, msg.sender, amount)
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

    /*///////////////////////////////////////////////////////////////
                            PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Convience function that triggers a hard revert.
    function hardRevert() external pure {
        // Call revert with the hard revert text.
        revert(HARD_REVERT_TEXT);
    }
}
