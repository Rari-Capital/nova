// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {Auth} from "@rari-capital/solmate/src/auth/Auth.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {NovaExecHashLib} from "./libraries/NovaExecHashLib.sol";
import {CrossDomainEnabled, iOVM_CrossDomainMessenger} from "./external/CrossDomainEnabled.sol";

import {L2_NovaRegistry} from "./L2_NovaRegistry.sol";
import {L1_NovaApprovalEscrow} from "./L1_NovaApprovalEscrow.sol";

/// @notice Entry point for relayers to execute requests.
/// @dev Deploys an L1_NovaApprovalEscrow and sends cross domain messages to the L2_NovaRegistry.
contract L1_NovaExecutionManager is Auth, CrossDomainEnabled {
    using SafeMath for uint256;

    /*///////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The revert message text used to trigger a hard revert.
    /// @notice The execution manager will ignore hard reverts if they are triggered by a strategy not registered as UNSAFE.
    string public constant HARD_REVERT_TEXT = "__NOVA__HARD__REVERT__";

    /// @notice The keccak256 hash of the hard revert text.
    /// @dev The exec function uses this hash the compare the revert reason of an execution with the hard revert text.
    bytes32 public constant HARD_REVERT_HASH = keccak256(abi.encodeWithSignature("Error(string)", HARD_REVERT_TEXT));

    /// @notice The 'default' value for currentExecHash.
    /// @dev Outside of an active exec call currentExecHash will always equal DEFAULT_EXECHASH.
    bytes32 public constant DEFAULT_EXECHASH = 0xFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACECAFEBEEF;

    /*///////////////////////////////////////////////////////////////
                              IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The address of the L2_NovaRegistry to send cross domain messages to.
    /// @dev This address will not have contract code on L1, it is the address of a contract
    /// deployed on L2. We can only communicate with this address using cross domain messages.
    address public immutable L2_NOVA_REGISTRY_ADDRESS;

    /// @notice The address of the L1_NovaApprovalEscrow to access tokens from.
    /// @dev The transferFromRelayer function uses the escrow as a proxy identity for relayers to approve their tokens to, where
    /// only the execution manager can transfer them. If relayers approved tokens directly to the execution manager, another relayer
    /// could steal them by calling exec with the token set as the strategy and transferFrom or pull (used by DAI/MKR) used as calldata.
    L1_NovaApprovalEscrow public immutable L1_NOVA_APPROVAL_ESCROW;

    /// @param _L2_NOVA_REGISTRY_ADDRESS The address of the L2_NovaRegistry on L2 to send cross domain messages to.
    /// @param _CROSS_DOMAIN_MESSENGER The L1 cross domain messenger contract to use for sending cross domain messages.
    constructor(address _L2_NOVA_REGISTRY_ADDRESS, iOVM_CrossDomainMessenger _CROSS_DOMAIN_MESSENGER)
        CrossDomainEnabled(_CROSS_DOMAIN_MESSENGER)
    {
        L2_NOVA_REGISTRY_ADDRESS = _L2_NOVA_REGISTRY_ADDRESS;

        // Create an approval escrow which implicitly becomes
        // owned by the execution manager in its constructor.
        L1_NOVA_APPROVAL_ESCROW = new L1_NovaApprovalEscrow();
    }

    /*///////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when `updateGasConfig` is called.
    /// @param newGasConfig The updated gasConfig.
    event GasConfigUpdated(GasConfig newGasConfig);

    /// @notice Emitted when `registerSelfAsStrategy` is called.
    /// @param strategyRiskLevel The risk level the strategy registered itself as.
    event StrategyRegistered(StrategyRiskLevel strategyRiskLevel);

    /// @notice Emitted when `exec` is called.
    /// @param execHash The execHash computed from arguments and transaction context.
    /// @param reverted Will be true if the strategy call reverted, will be false if not.
    /// @param gasUsed The gas estimate computed during the call.
    event Exec(bytes32 indexed execHash, address relayer, bool reverted, uint256 gasUsed);

    /*///////////////////////////////////////////////////////////////
                   GAS LIMIT/ESTIMATION CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    /// @dev Packed struct of gas limit/estimation configuration values used in exec.
    /// @param calldataByteGasEstimate The amount of gas to assume each byte of calldata consumes.
    /// @param missingGasEstimate The extra amount of gas the system consumes but cannot measure on the fly.
    /// @param strategyCallGasBuffer The extra amount of gas to keep as a buffer when calling a strategy.
    /// @param execCompletedMessageGasLimit The L2 gas limit to use for the cross domain call to execCompleted.
    struct GasConfig {
        // This needs to factor in raw calldata costs, along with the hidden
        // cost of abi decoding and copying the calldata into an Solidity function.
        uint32 calldataByteGasEstimate;
        // This needs to factor in the base transaction gas (currently 21000), along
        // with the gas cost of sending the cross domain message and emitting the Exec event.
        uint96 missingGasEstimate;
        // This needs to factor in the max amount of gas consumed after the strategy call, up
        // until the cross domain message is sent (as this is not accounted for in missingGasEstimate).
        uint96 strategyCallGasBuffer;
        // This needs to factor in the overhead of relaying the message on L2 (currently ~800k),
        // along with the actual L2 gas cost of calling the L2_NovaRegistry's execCompleted function.
        uint32 execCompletedMessageGasLimit;
    }

    /// @notice Gas limit/estimation configuration values used in exec.
    GasConfig public gasConfig =
        GasConfig({
            calldataByteGasEstimate: 13, // OpenGSN uses 13 to estimate gas per calldata byte too.
            missingGasEstimate: 200000, // Rough estimate for missing gas. Tune this in production.
            strategyCallGasBuffer: 5000, // Overly cautious gas buffer. Can likely be safely reduced.
            execCompletedMessageGasLimit: 1500000 // If the limit is too low, relayers won't get paid.
        });

    /// @notice Updates the gasConfig.
    /// @param newGasConfig The updated value to use for gasConfig.
    function updateGasConfig(GasConfig calldata newGasConfig) external requiresAuth {
        gasConfig = newGasConfig;

        emit GasConfigUpdated(newGasConfig);
    }

    /*///////////////////////////////////////////////////////////////
                      STRATEGY RISK LEVEL STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Risk classifications for strategies.
    enum StrategyRiskLevel {
        // The strategy has not been assigned a risk level.
        // It has the equivalent abilities of a SAFE strategy,
        // but could upgrade itself to an UNSAFE strategy at any time.
        UNKNOWN,
        // The strategy has registered itself as a safe strategy,
        // meaning it cannot use transferFromRelayer or trigger a hard
        // revert. A SAFE strategy cannot upgrade itself to become UNSAFE.
        SAFE,
        // The strategy has registered itself as an unsafe strategy,
        // meaning it has access to all the functionality the execution
        // manager provides like transferFromRelayer and the ability to hard
        // revert. An UNSAFE strategy cannot downgrade itself to become SAFE.
        UNSAFE
    }

    /// @notice Maps strategy addresses to their registered risk level.
    /// @dev This mapping is used to determine if strategies can access transferFromRelayer and trigger hard reverts.
    mapping(address => StrategyRiskLevel) public getStrategyRiskLevel;

    /// @notice Registers the caller as a strategy with the provided risk level.
    /// @dev A strategy can only register once, and will have no way to change its risk level after registering.
    /// @param strategyRiskLevel The risk level the strategy is registering as. Strategies cannot register as UNKNOWN.
    function registerSelfAsStrategy(StrategyRiskLevel strategyRiskLevel) external requiresAuth {
        // Ensure the strategy has not already registered itself, as if strategies could change their risk level arbitrarily
        // they would be able to trick relayers into executing them believing they were safe, and then use unsafe functionality.
        require(getStrategyRiskLevel[msg.sender] == StrategyRiskLevel.UNKNOWN, "ALREADY_REGISTERED");

        // Strategies can't register as UNKNOWN because it would emit an unhelpful StrategyRegistered event and confuse relayers.
        require(strategyRiskLevel != StrategyRiskLevel.UNKNOWN, "INVALID_RISK_LEVEL");

        // Set the strategy's risk level.
        getStrategyRiskLevel[msg.sender] = strategyRiskLevel;

        emit StrategyRegistered(strategyRiskLevel);
    }

    /*///////////////////////////////////////////////////////////////
                        EXECUTION CONTEXT STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The address who called exec.
    /// @dev This will not be reset after each execution completes.
    address public currentRelayer;

    /// @notice The address of the strategy that is currently being called.
    /// @dev This will not be reset after each execution completes.
    address public currentlyExecutingStrategy;

    /// @notice The execHash computed from the currently executing call to exec.
    /// @dev This will be reset to DEFAULT_EXECHASH after each execution completes.
    bytes32 public currentExecHash = DEFAULT_EXECHASH;

    /*///////////////////////////////////////////////////////////////
                            EXECUTION LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Executes a request and sends tips/gas/inputs to a specific address on L2.
    /// @param nonce The nonce of the request to execute.
    /// @param strategy The strategy specified in the request.
    /// @param l1Calldata The calldata associated with the request.
    /// @param l2Recipient An address who will receive the tips, gas and input tokens attached to the request on L2.
    /// @param deadline Timestamp after which the transaction will immediately revert.
    function exec(
        uint256 nonce,
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        address l2Recipient,
        uint256 deadline
    ) external {
        // Measure gas left at the start of execution.
        uint256 startGas = gasleft();

        // Check that the deadline has not already passed.
        require(block.timestamp <= deadline, "PAST_DEADLINE");

        // Substitute for Auth's requiresAuth modifier.
        require(isAuthorized(msg.sender, msg.sig), "UNAUTHORIZED");

        // Prevent the strategy or another contract from trying
        // to frontrun a relayer's execution and take their payment.
        require(currentExecHash == DEFAULT_EXECHASH, "ALREADY_EXECUTING");

        // We cannot allow calling cross domain messenger directly, as a
        // malicious relayer could use it to trigger the registry's execCompleted
        // function and claim bounties without actually executing the proper request(s).
        require(strategy != address(CROSS_DOMAIN_MESSENGER), "UNSAFE_STRATEGY");

        // We cannot allow calling the approval escrow directly, as a malicious
        // relayer could call its transferTokenToStrategy function and access tokens
        // from other relayers outside of a proper call to the transferFromRelayer function.
        require(strategy != address(L1_NOVA_APPROVAL_ESCROW), "UNSAFE_STRATEGY");

        // We cannot allow calling the execution manager itself, as any malicious
        // relayer could exploit Auth inherited functions to change ownership, blacklist
        // other relayers, or freeze the contract entirely, without being properly authorized.
        require(strategy != address(this), "UNSAFE_STRATEGY");

        // Compute the relevant execHash.
        bytes32 execHash = NovaExecHashLib.compute({
            nonce: nonce,
            strategy: strategy,
            l1Calldata: l1Calldata,
            gasLimit: gasLimit,
            gasPrice: tx.gasprice
        });

        // Initialize execution context.
        currentExecHash = execHash;
        currentRelayer = msg.sender;
        currentlyExecutingStrategy = strategy;

        // Call the strategy with a safe gas limit.
        (bool success, bytes memory returnData) = strategy.call{
            gas: gasLimit
                .sub(msg.data.length.mul(gasConfig.calldataByteGasEstimate))
                .sub(gasConfig.strategyCallGasBuffer)
                .sub(gasConfig.missingGasEstimate)
                .sub(startGas - gasleft())
        }(l1Calldata);

        // Revert if a valid hard revert was triggered. A hard revert is only valid if the strategy had a risk level of UNSAFE.
        require(
            success || keccak256(returnData) != HARD_REVERT_HASH || getStrategyRiskLevel[strategy] != StrategyRiskLevel.UNSAFE,
            "HARD_REVERT"
        );

        // Reset currentExecHash to default so transferFromRelayer becomes uncallable again.
        currentExecHash = DEFAULT_EXECHASH;

        // Estimate how much gas this tx will have consumed in total (not accounting for refunds).
        uint256 gasUsedEstimate = msg.data.length.mul(gasConfig.calldataByteGasEstimate).add(gasConfig.missingGasEstimate).add(
            startGas - gasleft()
        );

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
            gasConfig.execCompletedMessageGasLimit
        );

        emit Exec(execHash, msg.sender, !success, gasUsedEstimate);
    }

    /*///////////////////////////////////////////////////////////////
                          STRATEGY UTILITIES
    //////////////////////////////////////////////////////////////*/

    /// @notice Transfers tokens the relayer (the address that called exec)
    /// approved to the L1_NOVA_APPROVAL_ESCROW to currently executing strategy.
    /// @notice Can only be called by the currently executing strategy (if there is one at all).
    /// @notice The currently execution strategy must be registered as UNSAFE to use this function.
    /// @notice Will hard revert if the correct amount of tokens are not approved to the escrow.
    /// @param token The ER20 token to transfer to the currently executing strategy.
    /// @param amount The amount of the token to transfer to the currently executing strategy.
    function transferFromRelayer(address token, uint256 amount) external requiresAuth {
        // Only the currently executing strategy is allowed to call this function.
        // Since msg.sender is inexpensive, from here on it's used to access the strategy.
        require(msg.sender == currentlyExecutingStrategy, "NOT_CURRENT_STRATEGY");

        // Ensure currentExecHash is not set to DEFAULT_EXECHASH as otherwise a
        // malicious strategy could transfer tokens outside of an active execution.
        require(currentExecHash != DEFAULT_EXECHASH, "NO_ACTIVE_EXECUTION");

        // Ensure the strategy has registered itself as UNSAFE so relayers can
        // avoid strategies that use transferFromRelayer if they want to be cautious.
        require(getStrategyRiskLevel[msg.sender] == StrategyRiskLevel.UNSAFE, "UNSUPPORTED_RISK_LEVEL");

        // Transfer tokens from the relayer to the strategy.
        require(
            L1_NOVA_APPROVAL_ESCROW.transferApprovedToken({
                token: token,
                amount: amount,
                sender: currentRelayer,
                recipient: msg.sender
            }),
            HARD_REVERT_TEXT // Hard revert if the transfer fails.
        );
    }

    /// @notice Convenience function that triggers a hard revert.
    /// @notice The execution manager will ignore hard reverts if
    /// they are triggered by a strategy not registered as UNSAFE.
    function hardRevert() external pure {
        // Call revert with the hard revert text.
        revert(HARD_REVERT_TEXT);
    }
}
