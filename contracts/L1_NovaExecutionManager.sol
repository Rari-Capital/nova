// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {Auth} from "@rari-capital/solmate/src/auth/Auth.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SigLib} from "./libraries/SigLib.sol";
import {NovaExecHashLib} from "./libraries/NovaExecHashLib.sol";
import {CrossDomainEnabled, iOVM_CrossDomainMessenger} from "./external/CrossDomainEnabled.sol";

import {L2_NovaRegistry} from "./L2_NovaRegistry.sol";

contract L1_NovaExecutionManager is Auth, CrossDomainEnabled {
    /*///////////////////////////////////////////////////////////////
                        HARD REVERT CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The revert message text used to cause a hard revert.
    string public constant HARD_REVERT_TEXT = "__NOVA__HARD__REVERT__";

    /// @dev The hash of the hard revert message.
    bytes32 public constant HARD_REVERT_HASH = keccak256(abi.encodeWithSignature("Error(string)", HARD_REVERT_TEXT));

    /*///////////////////////////////////////////////////////////////
                    CROSS DOMAIN MESSAGE CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The address of the L2_NovaRegistry to send cross domain messages to.
    /// @dev This address will not have contract code on L1, it is the address of a contract
    /// deployed on L2. We can only communicate with this address using cross domain messages.
    address public immutable L2_NOVA_REGISTRY_ADDRESS;

    /// @notice The xDomainGasLimit to use for the cross domain call to execCompleted.
    /// @dev This needs to factor in the overhead of relaying the message on L2 (currently ~800k),
    /// along with the actual L2 gas cost of calling the L2_NovaRegistry's execCompleted function.
    uint32 public immutable EXEC_COMPLETED_MESSAGE_GAS_LIMIT;

    /// @param _L2_NOVA_REGISTRY_ADDRESS The address of the L2_NovaRegistry on L2 to send cross domain messages to.
    /// @param _CROSS_DOMAIN_MESSENGER The L1 xDomainMessenger contract to use for sending cross domain messages.
    /// @param _EXEC_COMPLETED_MESSAGE_GAS_LIMIT The xDomainGasLimit to use for the cross domain call to execCompleted.
    constructor(
        address _L2_NOVA_REGISTRY_ADDRESS,
        iOVM_CrossDomainMessenger _CROSS_DOMAIN_MESSENGER,
        uint32 _EXEC_COMPLETED_MESSAGE_GAS_LIMIT
    ) CrossDomainEnabled(_CROSS_DOMAIN_MESSENGER) {
        L2_NOVA_REGISTRY_ADDRESS = _L2_NOVA_REGISTRY_ADDRESS;
        EXEC_COMPLETED_MESSAGE_GAS_LIMIT = _EXEC_COMPLETED_MESSAGE_GAS_LIMIT;
    }

    /*///////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when `exec` is called.
    /// @param execHash The execHash computed from arguments and transaction context.
    /// @param reverted Will be true if the strategy call reverted, will be false if not.
    /// @param gasUsed The gas estimate computed during the call.
    event Exec(bytes32 indexed execHash, address relayer, bool reverted, uint256 gasUsed);

    /*///////////////////////////////////////////////////////////////
                     GAS ESTIMATION CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The amount of gas to assume each byte of calldata consumes.
    /// @dev Stored as a uint128 so it gets packed with missingGasEstimate.
    /// @dev This needs to factor in raw calldata costs, along with the hidden
    /// cost of abi decoding and copying the calldata into an Solidity function.
    uint128 public calldataByteGasEstimate = 13;

    /// @notice The amount of gas the system assumes it has not accounted for.
    /// @dev Stored as a uint128 so it gets packed with calldataByteGasEstimate.
    /// @dev This needs to factor in the base transaction gas (currently 21000), along
    /// with the gas cost of sending the cross domain message and emitting the Exec event.
    uint128 public missingGasEstimate = 200000;

    /// @notice Updates the missingGasEstimate configuration value.
    /// @param newMissingGasEstimate The updated value to use for missingGasEstimate.
    function setMissingGasEstimate(uint128 newMissingGasEstimate) external requiresAuth {
        missingGasEstimate = newMissingGasEstimate;
    }

    /// @notice Updates the calldataByteGasEstimate configuration value.
    /// @param newCalldataByteGasEstimate The updated value to use for calldataByteGasEstimate.
    function setCalldataByteGasEstimate(uint128 newCalldataByteGasEstimate) external requiresAuth {
        calldataByteGasEstimate = newCalldataByteGasEstimate;
    }

    /*///////////////////////////////////////////////////////////////
                        EXECUTION CONTEXT STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The 'default' value for `currentExecHash`.
    /// @notice Outside of an active `exec` call `currentExecHash` will always equal DEFAULT_EXECHASH.
    bytes32 public constant DEFAULT_EXECHASH = 0xFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEF;

    /// @notice The execHash computed from the currently executing call to `exec`.
    /// @notice This will be reset to DEFAULT_EXECHASH after each execution completes.
    bytes32 public currentExecHash = DEFAULT_EXECHASH;
    /// @notice The address who called `exec`.
    /// @notice This will not be reset after each execution completes.
    address public currentRelayer;
    /// @dev The address of the strategy that is currently being called.
    /// @dev This will not be reset after each execution completes.
    address public currentlyExecutingStrategy;

    /*///////////////////////////////////////////////////////////////
                           STATEFUL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Executes a request and sends tip/inputs to a specific address.
    /// @param nonce The nonce of the request.
    /// @param strategy The strategy requested in the request.
    /// @param l1Calldata The calldata associated with the request.
    /// @param l2Recipient The address of the account on L2 to receive the tip/inputs.
    /// @param deadline Timestamp after which the transaction will revert.
    function exec(
        uint256 nonce,
        address strategy,
        bytes calldata l1Calldata,
        address l2Recipient,
        uint256 deadline
    ) external {
        // Measure gas left at the start of execution.
        uint256 startGas = gasleft();

        // Check that the deadline has not already passed.
        require(block.timestamp <= deadline, "PAST_DEADLINE");

        // This prevents the strategy from performing a reentrancy attack.
        require(currentExecHash == DEFAULT_EXECHASH, "ALREADY_EXECUTING");

        // Check authorization of the caller (equivalent to Auth's `requiresAuth` modifier).
        require(isAuthorized(msg.sender, msg.sig), "UNAUTHORIZED");

        // We cannot allow providing address(0) for l2Recipient, as the registry
        // uses address(0) to indicate a request has not had its tokens removed yet.
        require(l2Recipient != address(0), "NEED_RECIPIENT");

        // We cannot allow calling the execution manager itself, as any malicious
        // relayer could exploit Auth inherited functions to change ownership, blacklist
        // other relayers, or freeze the contract entirely, without being properly authorized.
        require(strategy != address(this), "UNSAFE_STRATEGY");

        // Extract the 4 byte function signature from l1Calldata.
        // After Solidity 0.8.5 we can do this inline using slices.
        bytes4 calldataSig = SigLib.fromCalldata(l1Calldata);

        // We cannot allow calling IERC20.transferFrom directly, as a malicious
        // relayer could steal tokens approved to the registry by other relayers.
        require(calldataSig != IERC20.transferFrom.selector, "UNSAFE_CALLDATA");

        // We cannot allow calling iOVM_CrossDomainMessenger.sendMessage directly,
        // as a malicious relayer could use it to trigger the registry's execCompleted
        // function and claim bounties without actually executing the proper request(s).
        require(calldataSig != iOVM_CrossDomainMessenger.sendMessage.selector, "UNSAFE_CALLDATA");

        // Compute the execHash.
        bytes32 execHash =
            NovaExecHashLib.compute({nonce: nonce, strategy: strategy, l1Calldata: l1Calldata, gasPrice: tx.gasprice});

        // Initialize execution context.
        currentExecHash = execHash;
        currentRelayer = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy.
        (bool success, bytes memory returnData) = strategy.call(l1Calldata);

        // Revert if the strategy hard reverted.
        require(success || keccak256(returnData) != HARD_REVERT_HASH, "HARD_REVERT");

        // Reset currentExecHash to default so `transferFromRelayer` becomes uncallable again.
        currentExecHash = DEFAULT_EXECHASH;

        // Estimate how much gas the relayer will have paid (not accounting for refunds):
        uint256 gasUsedEstimate =
            missingGasEstimate + /* Estimate of unaccounted for gas usage (base tx cost + sendMessage) */
                (msg.data.length * calldataByteGasEstimate) + /* Calldata cost estimate */
                (startGas - gasleft()); /* Gas used so far */

        // Send message to unlock the bounty on L2.
        CROSS_DOMAIN_MESSENGER.sendMessage(
            L2_NOVA_REGISTRY_ADDRESS,
            abi.encodeWithSelector(
                L2_NovaRegistry.execCompleted.selector,
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

        emit Exec(execHash, msg.sender, !success, gasUsedEstimate);
    }

    /// @notice Transfers tokens from the relayer (the account that called execute) has approved to the execution manager for the currently executing strategy.
    /// @notice Can only be called by the currently executing strategy (if there is one at all).
    /// @notice Will trigger a hard revert if the correct amount of tokens are not approved when called.
    /// @param token The ER20-compliant token to transfer to the currently executing strategy.
    /// @param amount The amount of `token` (scaled by its decimals) to transfer to the currently executing strategy.
    function transferFromRelayer(address token, uint256 amount) external requiresAuth {
        // Only the currently executing strategy is allowed to call this function.
        require(msg.sender == currentlyExecutingStrategy, "NOT_CURRENT_STRATEGY");

        // Ensure currentExecHash is not set to DEFAULT_EXECHASH as otherwise
        // a strategy could call this function outside of an active execution.
        require(currentExecHash != DEFAULT_EXECHASH, "NO_ACTIVE_EXECUTION");

        // Transfer the token from the relayer the currently executing strategy (msg.sender is enforced to be the currentlyExecutingStrategy above).
        (bool success, bytes memory returnData) =
            address(token).call(
                // Encode a call to transferFrom.
                abi.encodeWithSelector(IERC20(token).transferFrom.selector, currentRelayer, msg.sender, amount)
            );

        // Hard revert if the transferFrom call reverted.
        require(success, HARD_REVERT_TEXT);

        // If it returned something, hard revert if it is not a positive bool.
        if (returnData.length > 0) {
            if (returnData.length == 32) {
                // It returned a bool, hard revert if it is not a positive bool.
                require(abi.decode(returnData, (bool)), HARD_REVERT_TEXT);
            } else {
                // It returned some data that was not a bool, let's hard revert.
                revert(HARD_REVERT_TEXT);
            }
        }
    }

    /*///////////////////////////////////////////////////////////////
                            PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Convenience function that triggers a hard revert.
    function hardRevert() external pure {
        // Call revert with the hard revert text.
        revert(HARD_REVERT_TEXT);
    }
}
