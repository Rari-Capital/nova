// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {Auth} from "@rari-capital/solmate/src/auth/Auth.sol";

import {NovaExecHashLib} from "./libraries/NovaExecHashLib.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";
import {CrossDomainEnabled, iOVM_CrossDomainMessenger} from "./external/CrossDomainEnabled.sol";

/// @notice Hub for contracts/users on L2 to create and manage requests.
/// @dev Receives messages from the L1_NovaExecutionManager via a cross domain messenger.
contract L2_NovaRegistry is Auth, CrossDomainEnabled {
    using SafeTransferLib for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /*///////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The maximum amount of input tokens that may be added to a request.
    uint256 public constant MAX_INPUT_TOKENS = 5;

    /// @notice The minimum delay between when unlockTokens and withdrawTokens can be called.
    uint256 public constant MIN_UNLOCK_DELAY_SECONDS = 300;

    /// @param _CROSS_DOMAIN_MESSENGER The L2 cross domain messenger to trust for receiving messages.
    constructor(iOVM_CrossDomainMessenger _CROSS_DOMAIN_MESSENGER) CrossDomainEnabled(_CROSS_DOMAIN_MESSENGER) {}

    /*///////////////////////////////////////////////////////////////
                    EXECUTION MANAGER ADDRESS STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The address of the only contract authorized to make cross domain calls to execCompleted.
    address public L1_NovaExecutionManagerAddress;

    /// @notice Authorizes newExecutionManagerAddress to make cross domain calls to execCompleted.
    /// @param newExecutionManagerAddress The address to authorized to make cross domain calls to execCompleted.
    function connectExecutionManager(address newExecutionManagerAddress) external requiresAuth {
        L1_NovaExecutionManagerAddress = newExecutionManagerAddress;

        emit ExecutionManagerConnected(newExecutionManagerAddress);
    }

    /*///////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when `connectExecutionManager` is called.
    /// @param newExecutionManagerAddress The new value for L1_NovaExecutionManagerAddress.
    event ExecutionManagerConnected(address newExecutionManagerAddress);

    /// @notice Emitted when `requestExec` is called.
    /// @param execHash The unique identifier generated for this request.
    /// @param strategy The strategy associated with the request.
    event RequestExec(bytes32 indexed execHash, address indexed strategy);

    /// @notice Emitted when `execCompleted` is called.
    /// @param execHash The unique identifier associated with the request executed.
    /// @param rewardRecipient The address the relayer specified to be the recipient of the tokens on L2.
    /// @param reverted If the strategy reverted on L1 during execution.
    /// @param gasUsed The amount of gas used by the execution tx on L1.
    event ExecCompleted(bytes32 indexed execHash, address indexed rewardRecipient, bool reverted, uint256 gasUsed);

    /// @notice Emitted when `claimInputTokens` is called.
    /// @param execHash The unique identifier associated with the request that had its input tokens claimed.
    event ClaimInputTokens(bytes32 indexed execHash);

    /// @notice Emitted when `withdrawTokens` is called.
    /// @param execHash The unique identifier associated with the request that had its tokens withdrawn.
    event WithdrawTokens(bytes32 indexed execHash);

    /// @notice Emitted when `unlockTokens` is called.
    /// @param execHash The unique identifier associated with the request that had a token unlock scheduled.
    /// @param unlockTimestamp When the unlock will set into effect and the creator will be able to call withdrawTokens.
    event UnlockTokens(bytes32 indexed execHash, uint256 unlockTimestamp);

    /// @notice Emitted when `relockTokens` is called.
    /// @param execHash The unique identifier associated with the request that had its tokens relocked.
    event RelockTokens(bytes32 indexed execHash);

    /// @notice Emitted when `speedUpRequest` is called.
    /// @param execHash The unique identifier associated with the request that was uncled and replaced by the newExecHash.
    /// @param newExecHash The execHash of the resubmitted request (copy of its uncle with an updated gasPrice).
    /// @param newNonce The nonce of the resubmitted request.
    /// @param switchTimestamp When the uncled request (execHash) will have its tokens transferred to the resubmitted request (newExecHash).
    event SpeedUpRequest(bytes32 indexed execHash, bytes32 indexed newExecHash, uint256 newNonce, uint256 switchTimestamp);

    /*///////////////////////////////////////////////////////////////
                       GLOBAL NONCE COUNTER STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The most recent nonce assigned to a request.
    uint256 public systemNonce;

    /*///////////////////////////////////////////////////////////////
                           PER REQUEST STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes to the creator of the request.
    mapping(bytes32 => address) public getRequestCreator;

    /// @notice Maps execHashes to the address of the strategy associated with the request.
    mapping(bytes32 => address) public getRequestStrategy;

    /// @notice Maps execHashes to the calldata associated with the request.
    mapping(bytes32 => bytes) public getRequestCalldata;

    /// @notice Maps execHashes to the gas limit that will be used when calling the request's strategy.
    mapping(bytes32 => uint256) public getRequestGasLimit;

    /// @notice Maps execHashes to the gas price (in wei) a relayer must use to execute the request.
    mapping(bytes32 => uint256) public getRequestGasPrice;

    /// @notice Maps execHashes to the additional tip (in wei) relayers will receive for successfully executing the request.
    mapping(bytes32 => uint256) public getRequestTip;

    /// @notice Maps execHashes to the nonce assigned to the request.
    mapping(bytes32 => uint256) public getRequestNonce;

    /// @notice A token/amount pair that a relayer will need on L1 to execute the request (and will be returned to them on L2).
    /// @param l2Token The token on L2 to transfer to the relayer upon a successful execution.
    /// @param amount The amount of l2Token to refund the relayer upon a successful execution.
    /// @dev Relayers must reference a list of L2-L1 token mappings to determine the L1 equivalent for an l2Token.
    /// @dev The decimal scheme may not align between the L1 and L2 tokens, relayers should check via off-chain logic.
    struct InputToken {
        IERC20 l2Token;
        uint256 amount;
    }

    /// @dev Maps execHashes to the input tokens a relayer must have to execute the request.
    mapping(bytes32 => InputToken[]) internal requestInputTokens;

    /// @notice Fetches the input tokens a relayer must have to execute a request.
    /// @return The input tokens required to execute the request.
    function getRequestInputTokens(bytes32 execHash) external view returns (InputToken[] memory) {
        return requestInputTokens[execHash];
    }

    /*///////////////////////////////////////////////////////////////
                       INPUT TOKEN RECIPIENT STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Struct containing data about the status of the request's input tokens.
    /// @param recipient The user who is entitled to take the request's input tokens.
    /// If recipient is not address(0), this means the request is no longer executable.
    /// @param isClaimed Will be true if the input tokens have been removed, false if not.
    struct InputTokenRecipientData {
        address recipient;
        bool isClaimed;
    }

    /// @notice Maps execHashes to a struct which contains data about the status of the request's input tokens.
    mapping(bytes32 => InputTokenRecipientData) public getRequestInputTokenRecipientData;

    /*///////////////////////////////////////////////////////////////
                              UNLOCK STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes to a timestamp representing when the request will have
    /// its tokens unlocked, meaning the creator can withdraw tokens from the request.
    /// @notice Will be 0 if no unlock has been scheduled.
    mapping(bytes32 => uint256) public getRequestUnlockTimestamp;

    /*///////////////////////////////////////////////////////////////
                              UNCLE STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes which represent resubmitted requests created
    /// via speedUpRequest to their corresponding "uncled" request's execHash.
    /// @notice An uncled request is a request that has had its tokens removed via
    /// speedUpRequest in favor of a resubmitted request generated in the transaction.
    /// @notice Will be bytes32(0) the request is not a resubmitted copy of an uncle.
    mapping(bytes32 => bytes32) public getRequestUncle;

    /// @notice Maps execHashes which represent requests uncled via
    /// speedUpRequest to their corresponding "resubmitted" request's execHash.
    /// @notice A resubmitted request is a request that is scheduled to replace its
    /// uncle after MIN_UNLOCK_DELAY_SECONDS from the time speedUpRequest was called.
    /// @notice Will be bytes32(0) if the request is not an uncle.
    mapping(bytes32 => bytes32) public getResubmittedRequest;

    /// @notice Maps execHashes to a timestamp representing when the request will be disabled
    /// and replaced by a re-submitted request with a higher gas price (via speedUpRequest).
    /// @notice Will be 0 if speedUpRequest has not been called with the execHash.
    mapping(bytes32 => uint256) public getRequestDeathTimestamp;

    /*///////////////////////////////////////////////////////////////
                           STATEFUL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Request a strategy to be executed with specific calldata and (optionally) input tokens.
    /// @notice The caller must attach (gasPrice * gasLimit) + tip of ETH to their call.
    /// @param strategy The address of the "strategy" contract that should be called on L1.
    /// @param l1Calldata The abi encoded calldata the strategy should be called with.
    /// @param gasLimit The gas limit that will be used when calling the strategy.
    /// @param gasPrice The gas price (in wei) a relayer must use to execute the request.
    /// @param tip The additional wei to pay as a tip for any relayer that successfully executes the request.
    /// If the relayer executes the request and the strategy reverts, the creator will be refunded the tip.
    /// @param inputTokens An array with a length of MAX_INPUT_TOKENS or less token/amount pairs that the relayer will
    /// need to execute the request on L1. Input tokens are refunded to the relayer on L2 after a successful execution.
    /// @return execHash The "execHash" (unique identifier) for this request.
    function requestExec(
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        InputToken[] calldata inputTokens
    ) public payable requiresAuth returns (bytes32 execHash) {
        // Do not allow more than MAX_INPUT_TOKENS input tokens as it could use too much gas.
        require(inputTokens.length <= MAX_INPUT_TOKENS, "TOO_MANY_INPUTS");

        // Ensure enough ETH was sent along with the call to cover gas and the tip.
        require(msg.value == gasLimit.mul(gasPrice).add(tip), "BAD_ETH_VALUE");

        // Increment the global nonce.
        systemNonce += 1;

        // Compute the execHash for this request.
        execHash = NovaExecHashLib.compute({
            nonce: systemNonce,
            strategy: strategy,
            l1Calldata: l1Calldata,
            gasPrice: gasPrice,
            gasLimit: gasLimit
        });

        // Store all critical request data.
        getRequestCreator[execHash] = msg.sender;
        getRequestStrategy[execHash] = strategy;
        getRequestCalldata[execHash] = l1Calldata;
        getRequestGasLimit[execHash] = gasLimit;
        getRequestGasPrice[execHash] = gasPrice;
        getRequestTip[execHash] = tip;
        getRequestNonce[execHash] = systemNonce;

        emit RequestExec(execHash, strategy);

        // Transfer input tokens in that the request creator has approved.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransferFrom(msg.sender, address(this), inputTokens[i].amount);

            // We can't just put a calldata/memory array directly into storage so we have to go index by index.
            requestInputTokens[execHash].push(inputTokens[i]);
        }
    }

    /// @notice Calls requestExec with all relevant parameters and unlockTokens with the autoUnlockDelay.
    /// @notice See requestExec and unlockTokens for more information.
    function requestExecWithTimeout(
        address strategy,
        bytes calldata l1Calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        InputToken[] calldata inputTokens,
        uint256 autoUnlockDelaySeconds
    ) external payable returns (bytes32 execHash) {
        // Create a request and get its execHash.
        execHash = requestExec(strategy, l1Calldata, gasLimit, gasPrice, tip, inputTokens);

        // Schedule an unlock set to complete autoUnlockDelay seconds from now.
        unlockTokens(execHash, autoUnlockDelaySeconds);
    }

    /// @notice Claims input tokens earned from executing a request.
    /// @notice Request creators must also call this function if their request
    /// reverted (as input tokens are not sent to relayers if the request reverts).
    /// @notice Anyone may call this function, but the tokens will be sent to the proper input token recipient
    /// (either the l2Recipient given in execCompleted or the request creator if the request reverted).
    /// @param execHash The unique identifier of the executed request.
    function claimInputTokens(bytes32 execHash) external requiresAuth {
        // Get a pointer to the input token recipient data.
        InputTokenRecipientData storage inputTokenRecipientData = getRequestInputTokenRecipientData[execHash];

        // Ensure input tokens for this request are ready to be sent to a recipient.
        require(inputTokenRecipientData.recipient != address(0), "NO_RECIPIENT");

        // Ensure that the tokens have not already been claimed.
        require(!inputTokenRecipientData.isClaimed, "ALREADY_CLAIMED");

        // Mark the input tokens as claimed.
        inputTokenRecipientData.isClaimed = true;

        emit ClaimInputTokens(execHash);

        // Loop over each input token to transfer it to the recipient.
        InputToken[] memory inputTokens = requestInputTokens[execHash];
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransfer(inputTokenRecipientData.recipient, inputTokens[i].amount);
        }
    }

    /// @notice Unlocks a request's tokens after a delay. Once the delay has passed,
    /// anyone can call withdrawTokens on behalf of the creator to refund their tokens.
    /// @notice unlockDelaySeconds must be greater than or equal to MIN_UNLOCK_DELAY_SECONDS.
    /// @notice The caller must be the creator of the request associated with the execHash.
    /// @param execHash The unique identifier of the request to unlock tokens for.
    /// @param unlockDelaySeconds The delay (in seconds) until the creator can withdraw their tokens.
    function unlockTokens(bytes32 execHash, uint256 unlockDelaySeconds) public requiresAuth {
        // Ensure the request currently has tokens.
        (bool requestHasTokens, ) = hasTokens(execHash);
        require(requestHasTokens, "REQUEST_HAS_NO_TOKENS");

        // Ensure an unlock is not already scheduled.
        require(getRequestUnlockTimestamp[execHash] == 0, "UNLOCK_ALREADY_SCHEDULED");

        // Ensure the caller is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");

        // Ensure the delay is greater than the minimum.
        require(unlockDelaySeconds >= MIN_UNLOCK_DELAY_SECONDS, "DELAY_TOO_SMALL");

        // Set the unlock timestamp to block.timestamp + unlockDelaySeconds.
        uint256 unlockTimestamp = block.timestamp.add(unlockDelaySeconds);
        getRequestUnlockTimestamp[execHash] = unlockTimestamp;

        emit UnlockTokens(execHash, unlockTimestamp);
    }

    /// @notice Reverses a request's completed token unlock, hence requiring the creator
    /// to call unlockTokens again if they wish to cancel their request another time.
    /// @notice The caller must be the creator of the request associated with the execHash.
    /// @param execHash The unique identifier of the request which has been unlocked.
    function relockTokens(bytes32 execHash) external requiresAuth {
        // Ensure the request currently has tokens.
        (bool requestHasTokens, ) = hasTokens(execHash);
        require(requestHasTokens, "REQUEST_HAS_NO_TOKENS");

        // Ensure that the request has had its tokens unlocked.
        (bool tokensUnlocked, ) = areTokensUnlocked(execHash);
        require(tokensUnlocked, "NOT_UNLOCKED");

        // Ensure the caller is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");

        // Reset the unlock timestamp to 0.
        delete getRequestUnlockTimestamp[execHash];

        emit RelockTokens(execHash);
    }

    /// @notice Withdraws tokens from an unlocked request.
    /// @notice The creator of the request associated with the execHash must call unlockTokens and
    /// wait the unlockDelaySeconds they specified before tokens may be withdrawn from their request.
    /// @notice Anyone may call this function, but the tokens will still go the creator of the request associated with the execHash.
    /// @param execHash The unique identifier of the request to withdraw tokens from.
    function withdrawTokens(bytes32 execHash) external requiresAuth {
        // Ensure that the tokens are unlocked.
        (bool tokensUnlocked, ) = areTokensUnlocked(execHash);
        require(tokensUnlocked, "NOT_UNLOCKED");

        // Ensure that the tokens have not already been removed.
        (bool requestHasTokens, ) = hasTokens(execHash);
        require(requestHasTokens, "REQUEST_HAS_NO_TOKENS");

        // Get the request creator.
        address creator = getRequestCreator[execHash];

        // Store that the request has had its input tokens withdrawn.
        // isClaimed is set to true so the creator cannot call claimInputTokens to claim their tokens twice!
        getRequestInputTokenRecipientData[execHash] = InputTokenRecipientData({recipient: creator, isClaimed: true});

        emit WithdrawTokens(execHash);

        // Transfer the ETH which would have been used for (gas + tip) back to the creator.
        creator.safeTransferETH(getRequestGasPrice[execHash].mul(getRequestGasLimit[execHash]).add(getRequestTip[execHash]));

        // Transfer input tokens back to the creator.
        InputToken[] memory inputTokens = requestInputTokens[execHash];
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransfer(creator, inputTokens[i].amount);
        }
    }

    /// @notice Resubmit a request with a higher gas price.
    /// @notice This will "uncle" the execHash which means after MIN_UNLOCK_DELAY_SECONDS it will be disabled and the newExecHash will be enabled.
    /// @notice The caller must be the creator of the request associated with the execHash.
    /// @param execHash The unique identifier of the request you wish to resubmit with a higher gas price.
    /// @param gasPrice The updated gas price to use for the resubmitted request.
    /// @return newExecHash The unique identifier for the resubmitted request.
    function speedUpRequest(bytes32 execHash, uint256 gasPrice) external payable requiresAuth returns (bytes32 newExecHash) {
        // Ensure the request currently has tokens.
        (bool requestHasTokens, ) = hasTokens(execHash);
        require(requestHasTokens, "REQUEST_HAS_NO_TOKENS");

        // Ensure that msg.sender is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");

        // Ensure the request has not already been sped up.
        require(getRequestDeathTimestamp[execHash] == 0, "ALREADY_SPED_UP");

        // Get the previous gas price.
        uint256 previousGasPrice = getRequestGasPrice[execHash];

        // Ensure that the new gas price is greater than the previous.
        require(gasPrice > previousGasPrice, "GAS_PRICE_MUST_BE_HIGHER");

        // Compute the timestamp when the request would become uncled.
        uint256 switchTimestamp = MIN_UNLOCK_DELAY_SECONDS.add(block.timestamp);

        // Ensure that if there is a token unlock scheduled it would be after the switch.
        // Tokens cannot be withdrawn after the switch, which is why it's safe if they unlock after.
        uint256 tokenUnlockTimestamp = getRequestUnlockTimestamp[execHash];
        require(tokenUnlockTimestamp == 0 || tokenUnlockTimestamp > switchTimestamp, "UNLOCK_BEFORE_SWITCH");

        // Get more data about the previous request.
        address previousStrategy = getRequestStrategy[execHash];
        bytes memory previousCalldata = getRequestCalldata[execHash];
        uint256 previousGasLimit = getRequestGasLimit[execHash];

        // Ensure enough ETH was sent along with the call to cover the increased gas price.
        require(msg.value == gasPrice.sub(previousGasPrice).mul(previousGasLimit), "BAD_ETH_VALUE");

        // Generate a new execHash for the resubmitted request.
        systemNonce += 1;
        newExecHash = NovaExecHashLib.compute({
            nonce: systemNonce,
            strategy: previousStrategy,
            l1Calldata: previousCalldata,
            gasLimit: previousGasLimit,
            gasPrice: gasPrice
        });

        // Fill out data for the resubmitted request.
        getRequestCreator[newExecHash] = msg.sender;
        getRequestStrategy[newExecHash] = previousStrategy;
        getRequestCalldata[newExecHash] = previousCalldata;
        getRequestGasLimit[newExecHash] = previousGasLimit;
        getRequestGasPrice[newExecHash] = gasPrice;
        getRequestTip[newExecHash] = getRequestTip[execHash];
        getRequestNonce[execHash] = systemNonce;

        // Map the resubmitted request to its uncle.
        getRequestUncle[newExecHash] = execHash;
        getResubmittedRequest[execHash] = newExecHash;

        // Set the uncled request to die in MIN_UNLOCK_DELAY_SECONDS.
        getRequestDeathTimestamp[execHash] = switchTimestamp;

        emit SpeedUpRequest(execHash, newExecHash, systemNonce, switchTimestamp);
    }

    /*///////////////////////////////////////////////////////////////
                  CROSS DOMAIN MESSENGER ONLY FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @dev Distributes rewards to the relayer of a request.
    /// @dev Only the linked L1_NovaExecutionManager can call via the cross domain messenger.
    /// @param execHash The unique identifier of the request that was executed.
    /// @param rewardRecipient The address the relayer specified to be the recipient of rewards on L2.
    /// @param reverted If the strategy reverted during execution.
    /// @param gasUsed The amount of gas used by the execution tx on L1.
    function execCompleted(
        bytes32 execHash,
        address rewardRecipient,
        bool reverted,
        uint256 gasUsed
    ) external onlyFromCrossDomainAccount(L1_NovaExecutionManagerAddress) {
        // Ensure the request still has tokens.
        (bool requestHasTokens, ) = hasTokens(execHash);
        require(requestHasTokens, "REQUEST_HAS_NO_TOKENS");

        // We cannot allow providing address(0) for rewardRecipient, as we
        // use address(0) to indicate a request has not its tokens removed.
        require(rewardRecipient != address(0), "INVALID_RECIPIENT");

        // Get relevant request data.
        uint256 tip = getRequestTip[execHash];
        uint256 gasLimit = getRequestGasLimit[execHash];
        uint256 gasPrice = getRequestGasPrice[execHash];
        address requestCreator = getRequestCreator[execHash];
        bytes32 resubmittedRequest = getResubmittedRequest[execHash];

        // The amount of ETH to pay for the gas consumed, capped at the gas limit.
        uint256 gasPayment = gasPrice.mul(gasUsed > gasLimit ? gasLimit : gasUsed);

        // Give the proper input token recipient the ability to claim the tokens.
        // isClaimed is implicitly kept as false, so the recipient can claim the tokens with claimInputTokens.
        getRequestInputTokenRecipientData[execHash].recipient = reverted ? requestCreator : rewardRecipient;

        emit ExecCompleted(execHash, rewardRecipient, reverted, gasUsed);

        // Pay the reward recipient for gas consumed and the tip if execution did not revert.
        rewardRecipient.safeTransferETH(gasPayment.add(reverted ? 0 : tip));

        // Refund any unused gas, the tip if execution reverted, and extra ETH from the resubmitted request if necessary.
        requestCreator.safeTransferETH(
            gasLimit.mul(gasPrice).sub(gasPayment).add(reverted ? tip : 0).add(
                // Refund the ETH attached to the request's resubmitted copy if necessary.
                // The hasTokens call above ensures that this request isn't a dead uncle.
                resubmittedRequest != bytes32(0) ? getRequestGasPrice[resubmittedRequest].sub(gasPrice).mul(gasLimit) : 0
            )
        );
    }

    /*///////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks if a request exists and hasn't been withdrawn, uncled, or executed.
    /// @notice A resubmitted request isn't considered to exist until its uncle dies.
    /// @param execHash The unique identifier of the request to check.
    /// @return requestHasTokens A boolean indicating if the request exists and has all of its tokens.
    /// @return changeTimestamp A timestamp indicating when the request may have its tokens removed or added.
    /// Will be 0 if there is no removal/addition expected.
    /// Will also be 0 if the request has had its tokens withdrawn or was executed.
    /// Will be a timestamp if the request will have its tokens added soon (it's a resubmitted copy of an uncled request)
    /// or if the request will have its tokens removed soon (it's an uncled request scheduled to die soon).
    function hasTokens(bytes32 execHash) public view returns (bool requestHasTokens, uint256 changeTimestamp) {
        if (getRequestInputTokenRecipientData[execHash].recipient != address(0)) {
            // The request has been executed or had its tokens withdrawn,
            // so we know its tokens are removed and won't be added back.
            return (false, 0);
        }

        uint256 deathTimestamp = getRequestDeathTimestamp[execHash];
        if (deathTimestamp != 0) {
            if (block.timestamp >= deathTimestamp) {
                // This request is an uncle which has died, meaning its
                // tokens have been removed and sent to a resubmitted request.
                return (false, 0);
            } else {
                // This request is an uncle which has not died yet, so we know
                // it has tokens that will be removed on its deathTimestamp.
                return (true, deathTimestamp);
            }
        }

        bytes32 uncleExecHash = getRequestUncle[execHash];
        if (uncleExecHash == bytes32(0)) {
            if (getRequestCreator[execHash] == address(0)) {
                // The request passed all the previous removal checks but
                // doesn't actually exist, so we know it does not have tokens.
                return (false, 0);
            } else {
                // This request does not have an uncle and has passed all
                // the previous removal checks, so we know it has tokens.
                return (true, 0);
            }
        }

        if (getRequestInputTokenRecipientData[uncleExecHash].recipient != address(0)) {
            // This request is a resubmitted version of its uncle
            // which was executed before it could "die" and switch its
            // tokens to this request, so we know it does not have tokens.
            return (false, 0);
        }

        uint256 uncleDeathTimestamp = getRequestDeathTimestamp[uncleExecHash];
        if (uncleDeathTimestamp > block.timestamp) {
            // This request is a resubmitted version of its uncle which has
            // not "died" yet, so we know it does not have its tokens yet,
            // but will receive them after the uncleDeathTimestamp.
            return (false, uncleDeathTimestamp);
        }

        // This is a resubmitted request with an uncle that died properly
        // without being executed early, so we know it has its tokens.
        return (true, 0);
    }

    /// @notice Checks if a request has had an unlock completed (unlockTokens was called and MIN_UNLOCK_DELAY_SECONDS has passed).
    /// @param execHash The unique identifier of the request to check.
    /// @return unlocked A boolean indicating if the request has had an unlock completed and hence a withdrawal can be triggered.
    /// @return changeTimestamp A timestamp indicating when the request may have its unlock completed.
    /// Will be 0 if there is no unlock scheduled or the request has already completed an unlock.
    /// It will be a timestamp if an unlock has been scheduled but not completed.
    function areTokensUnlocked(bytes32 execHash) public view returns (bool unlocked, uint256 changeTimestamp) {
        uint256 tokenUnlockTimestamp = getRequestUnlockTimestamp[execHash];

        if (tokenUnlockTimestamp == 0) {
            // There is no unlock scheduled.
            unlocked = false;
            changeTimestamp = 0;
        } else {
            // There has been an unlock scheduled/completed.
            unlocked = block.timestamp >= tokenUnlockTimestamp;
            changeTimestamp = unlocked ? 0 : tokenUnlockTimestamp;
        }
    }
}
