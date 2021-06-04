// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "ovm-safeerc20/OVM_SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@eth-optimism/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";
import "./external/Multicall.sol";
import "./external/DSAuth.sol";
import "./external/LowGasSafeMath.sol";

import "./libraries/NovaExecHashLib.sol";

contract L2_NovaRegistry is DSAuth, OVM_CrossDomainEnabled, ReentrancyGuard, Multicall {
    using OVM_SafeERC20 for IERC20;
    using LowGasSafeMath for uint256;

    /*///////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The minimum delay between when `unlockTokens` and `withdrawTokens` can be called.
    uint256 public constant MIN_UNLOCK_DELAY_SECONDS = 300;

    /// @notice The ERC20 users must use to pay for the L1 gas usage of request.
    IERC20 public immutable ETH;

    /// @param _ETH An ERC20 ETH you would like users to pay for gas with.
    /// @param _messenger The L2 xDomainMessenger contract you want to use to recieve messages.
    constructor(address _ETH, address _messenger) OVM_CrossDomainEnabled(_messenger) {
        ETH = IERC20(_ETH);
    }

    /*///////////////////////////////////////////////////////////////
                    EXECUTION MANAGER ADDRESS STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The address of the only contract authorized to make cross domain calls to `execCompleted`.
    address public L1_NovaExecutionManagerAddress;

    /// @notice Authorizes the `_L1_NovaExecutionManagerAddress` to make cross domain calls to `execCompleted`.
    /// @notice Each call to `connectExecutionManager` overrides the previous value, you cannot have multiple authorized execution managers at once.
    /// @param _L1_NovaExecutionManagerAddress The address to be authorized to make cross domain calls to `execCompleted`.
    function connectExecutionManager(address _L1_NovaExecutionManagerAddress) external auth {
        L1_NovaExecutionManagerAddress = _L1_NovaExecutionManagerAddress;
    }

    /*///////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when `requestExec` is called.
    /// @param nonce The nonce assigned to this request.
    event RequestExec(bytes32 indexed execHash, address indexed strategy, uint256 nonce);

    /// @notice Emitted when `execCompleted` is called.
    event ExecCompleted(bytes32 indexed execHash, address indexed rewardRecipient, bool reverted, uint256 gasUsed);

    /// @notice Emitted when `claim` is called.
    event ClaimInputTokens(bytes32 indexed execHash);

    /// @notice Emitted when `withdrawTokens` is called.
    event WithdrawTokens(bytes32 indexed execHash);

    /// @notice Emitted when `unlockTokens` is called.
    /// @param unlockTimestamp When the unlock will set into effect and the creator will be able to call `withdrawTokens`.
    event UnlockTokens(bytes32 indexed execHash, uint256 unlockTimestamp);

    /// @notice Emitted when `relockTokens` is called.
    event RelockTokens(bytes32 indexed execHash);

    /// @notice Emitted when `speedUpRequest` is called.
    /// @param newExecHash The execHash of the resubmitted request (copy of its uncle with an updated gasPrice).
    /// @param newNonce The nonce of the resubmitted request.
    /// @param changeTimestamp When the uncled request (`execHash`) will have its tokens transfered to the resubmitted request (`newExecHash`).
    event SpeedUpRequest(
        bytes32 indexed execHash,
        bytes32 indexed newExecHash,
        uint256 newNonce,
        uint256 changeTimestamp
    );

    /*///////////////////////////////////////////////////////////////
                       GLOBAL NONCE COUNTER STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The most recent nonce assigned to an execution request.
    uint256 public systemNonce;

    /*///////////////////////////////////////////////////////////////
                           PER REQUEST STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes to the creator of each request.
    mapping(bytes32 => address) public getRequestCreator;
    /// @notice Maps execHashes to the address of the strategy associated with the request.
    mapping(bytes32 => address) public getRequestStrategy;
    /// @notice Maps execHashes to the calldata associated with the request.
    mapping(bytes32 => bytes) public getRequestCalldata;
    /// @notice Maps execHashes to the gas limit a relayer should use to execute the request.
    mapping(bytes32 => uint64) public getRequestGasLimit;
    /// @notice Maps execHashes to the gas price a relayer must use to execute the request.
    mapping(bytes32 => uint256) public getRequestGasPrice;
    /// @notice Maps execHashes to the additional tip in wei relayers will receive for executing them.
    mapping(bytes32 => uint256) public getRequestTip;
    /// @notice Maps execHashes to the nonce of each request.
    /// @notice This is just for convenience, does not need to be on-chain.
    mapping(bytes32 => uint256) public getRequestNonce;

    /// @notice A token/amount pair that a relayer will need on L1 to execute the request (and will be returned to them on L2).
    /// @param l2Token The token on L2 to transfer to the relayer upon a successful execution.
    /// @param amount The amount of the `l2Token` to the relayer upon a successful execution (scaled by the `l2Token`'s decimals).
    /// @dev Relayers may have to reference a registry/list of some sort to determine the equivalent L1 token they will need.
    /// @dev The decimal scheme may not align between the L1 and L2 tokens, a relayer should check via off-chain logic.
    struct InputToken {
        IERC20 l2Token;
        uint256 amount;
    }

    /// @notice Maps execHashes to the input tokens a relayer must have to execute the request.
    mapping(bytes32 => InputToken[]) public requestInputTokens;

    function getRequestInputTokens(bytes32 execHash) external view returns (InputToken[] memory) {
        return requestInputTokens[execHash];
    }

    /*///////////////////////////////////////////////////////////////
                       INPUT TOKEN RECIPIENT STORAGE
    //////////////////////////////////////////////////////////////*/

    struct InputTokenRecipientData {
        address recipient;
        bool isClaimed;
    }

    /// @notice Maps execHashes to the address of the user who recieved the input tokens for executing or withdrawing the request.
    /// @notice Will be address(0) if no one has executed or withdrawn the request yet.
    mapping(bytes32 => InputTokenRecipientData) public getRequestInputTokenRecipient;

    /*///////////////////////////////////////////////////////////////
                              UNLOCK STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes to a timestamp representing when the request will have its tokens unlocked, meaning the creator can withdraw their bounties/inputs.
    /// @notice Will be 0 if no unlock has been scheduled.
    mapping(bytes32 => uint256) public getRequestUnlockTimestamp;

    /*///////////////////////////////////////////////////////////////
                              UNCLE STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps execHashes which represent resubmitted requests (via speedUpRequest) to their corresponding "uncled" request's execHash.
    /// @notice An uncled request is a request that has had its tokens removed via `speedUpRequest` in favor of a resubmitted request generated in the transaction.
    /// @notice Will be bytes32("") if `speedUpRequest` has not been called with the `execHash`.
    mapping(bytes32 => bytes32) public getRequestUncle;

    /// @notice Maps execHashes to a timestamp representing when the request will be disabled and replaced by a re-submitted request with a higher gas price (via `speedUpRequest`).
    /// @notice Will be 0 if `speedUpRequest` has not been called with the `execHash`.
    mapping(bytes32 => uint256) public getRequestUncleDeathTimestamp;

    /*///////////////////////////////////////////////////////////////
                           STATEFUL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Request `strategy` to be executed with `l1calldata`.
    /// @notice The caller must approve `(gasPrice * gasLimit) + tip` of `ETH` before calling.
    /// @param strategy The address of the "strategy" contract on L1 a relayer should call with `calldata`.
    /// @param l1calldata The abi encoded calldata a relayer should call the `strategy` with on L1.
    /// @param gasLimit The gas limit a relayer should use on L1.
    /// @param gasPrice The gas price (in wei) a relayer should use on L1.
    /// @param tip The additional wei to pay as a tip for any relayer that executes this request.
    /// @param inputTokens An array of 5 or less token/amount pairs that a relayer will need on L1 to execute the request (and will be returned to them on L2). `inputTokens` will not be awarded if the `strategy` reverts on L1.
    /// @return execHash The "execHash" (unique identifier) for this request.
    function requestExec(
        address strategy,
        bytes calldata l1calldata,
        uint64 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        InputToken[] calldata inputTokens
    ) public nonReentrant auth returns (bytes32 execHash) {
        // Do not allow more than 5 input tokens.
        require(inputTokens.length <= 5, "TOO_MANY_INPUTS");

        // Increment global nonce.
        systemNonce += 1;
        // Compute execHash for this request.
        execHash = NovaExecHashLib.compute({
            nonce: systemNonce,
            strategy: strategy,
            l1calldata: l1calldata,
            gasPrice: gasPrice
        });

        emit RequestExec(execHash, strategy, systemNonce);

        // Store all critical request data.
        getRequestCreator[execHash] = msg.sender;
        getRequestStrategy[execHash] = strategy;
        getRequestCalldata[execHash] = l1calldata;
        getRequestGasLimit[execHash] = gasLimit;
        getRequestGasPrice[execHash] = gasPrice;
        getRequestTip[execHash] = tip;
        // Storing the nonce is just for convenience; it does not need to be on-chain.
        getRequestNonce[execHash] = systemNonce;

        // Transfer in ETH to pay for max gas usage + tip.
        ETH.safeTransferFrom(msg.sender, address(this), (gasLimit * gasPrice) + tip);

        // Transfer input tokens in that the msg.sender has approved.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransferFrom(msg.sender, address(this), inputTokens[i].amount);

            // Copy over this index to the requestInputTokens mapping (we can't just put a calldata/memory array directly into storage so we have to go index by index).
            requestInputTokens[execHash].push(inputTokens[i]);
        }
    }

    /// @notice Calls `requestExec` with all relevant parameters along with calling `unlockTokens` with the `autoUnlockDelay` argument.
    /// @dev See `requestExec` and `unlockTokens` for more information.
    function requestExecWithTimeout(
        address strategy,
        bytes calldata l1calldata,
        uint64 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        InputToken[] calldata inputTokens,
        uint256 autoUnlockDelay
    ) external returns (bytes32 execHash) {
        execHash = requestExec(strategy, l1calldata, gasLimit, gasPrice, tip, inputTokens);

        unlockTokens(execHash, autoUnlockDelay);
    }

    /// @notice Claims input tokens earned from executing a request.
    /// @notice Request creators must also call this function if their request reverted (as input tokens are not sent to relayers if the request reverts).
    /// @notice Anyone may call this function, but the tokens will be sent to the proper input token recipient (either the l2Recpient given in `execCompleted` or the request creator if the request reverted).
    /// @param execHash The hash of the executed request.
    function claimInputTokens(bytes32 execHash) external nonReentrant auth {
        InputTokenRecipientData memory inputTokenRecipientData = getRequestInputTokenRecipient[execHash];

        // Ensure that the tokens have not already been claimed.
        require(!inputTokenRecipientData.isClaimed, "ALREADY_CLAIMED");

        InputToken[] memory inputTokens = requestInputTokens[execHash];

        emit ClaimInputTokens(execHash);

        // Loop over each input token to transfer it to the recipient.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransfer(inputTokenRecipientData.recipient, inputTokens[i].amount);
        }
    }

    /// @notice Unlocks a request's tokens with a delay. Once the delay has passed, anyone may call `withdrawTokens` on behalf of the creator to send the bounties/input tokens back.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to unlock.
    /// @param unlockDelaySeconds The delay in seconds until the creator can withdraw their tokens. Must be greater than or equal to `MIN_UNLOCK_DELAY_SECONDS`.
    function unlockTokens(bytes32 execHash, uint256 unlockDelaySeconds) public auth {
        // Ensure the request has not already had its tokens removed.
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        // Make sure that an unlock is not arleady scheduled.
        require(getRequestUnlockTimestamp[execHash] == 0, "UNLOCK_ALREADY_SCHEDULED");
        // Make sure the caller is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");
        // Make sure the delay is greater than the minimum.
        require(unlockDelaySeconds >= MIN_UNLOCK_DELAY_SECONDS, "DELAY_TOO_SMALL");

        // Set the delay timestamp to (current timestamp + the delay)
        uint256 timestamp = block.timestamp.add(unlockDelaySeconds);
        getRequestUnlockTimestamp[execHash] = timestamp;

        emit UnlockTokens(execHash, timestamp);
    }

    /// @notice Cancels a scheduled unlock.
    /// @param execHash The unique hash of the request which has an unlock scheduled.
    function relockTokens(bytes32 execHash) external auth {
        // Ensure the request has not already had its tokens removed.
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        // Make sure the caller is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");

        // Reset the unlock timestamp to 0.
        delete getRequestUnlockTimestamp[execHash];

        emit RelockTokens(execHash);
    }

    /// @notice Withdraws tokens (input/gas/bounties) from an unlocked request.
    /// @notice The creator of the request associated with `execHash` must call `unlockTokens` and wait the `unlockDelaySeconds` they specified before calling `withdrawTokens`.
    /// @notice Anyone may call this function, but the tokens will still go the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to withdraw from.
    function withdrawTokens(bytes32 execHash) external nonReentrant auth {
        // Ensure that the tokens are unlocked.
        (bool tokensUnlocked, ) = areTokensUnlocked(execHash);
        require(tokensUnlocked, "NOT_UNLOCKED");
        // Ensure that the tokens have not already been removed.
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");

        emit WithdrawTokens(execHash);

        address creator = getRequestCreator[execHash];
        InputToken[] memory inputTokens = requestInputTokens[execHash];

        // Store that the request has had its tokens removed.
        getRequestInputTokenRecipient[execHash].isClaimed = true;

        // Transfer the ETH which would have been used for (gas + tip) back to the creator.
        ETH.safeTransfer(
            creator,
            (getRequestGasPrice[execHash] * getRequestGasLimit[execHash]) + getRequestTip[execHash]
        );

        // Transfer input tokens back to the creator.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransfer(creator, inputTokens[i].amount);
        }
    }

    /// @notice Resubmit a request with a higher gas price.
    /// @notice This will "uncle" the `execHash` which means after `MIN_UNLOCK_DELAY_SECONDS` it will be disabled and the `newExecHash` will be enabled.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The execHash of the request you wish to resubmit with a higher gas price.
    /// @param gasPrice The updated gas price to use for the resubmitted request.
    /// @return newExecHash The unique identifier for the resubmitted request.
    function speedUpRequest(bytes32 execHash, uint256 gasPrice) external auth returns (bytes32 newExecHash) {
        // Ensure that msg.sender is the creator of the request.
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");
        // Ensure tokens have not already been removed.
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");

        // Get the previous gas price.
        uint256 previousGasPrice = getRequestGasPrice[execHash];

        // Ensure that the new gas price is greater than the previous.
        require(gasPrice > previousGasPrice, "LESS_THAN_PREVIOUS_GAS_PRICE");

        // Get the timestamp when the `execHash` would become uncled if this `speedUpRequest` call succeeds.
        uint256 switchTimestamp = MIN_UNLOCK_DELAY_SECONDS + block.timestamp;

        // Ensure that if there is a token unlock scheduled it would be after the switch.
        // Tokens cannot be withdrawn after the switch which is why it's safe if they unlock after.
        uint256 tokenUnlockTimestamp = getRequestUnlockTimestamp[execHash];
        require(tokenUnlockTimestamp == 0 || tokenUnlockTimestamp > block.timestamp, "UNLOCK_BEFORE_SWITCH");

        // Get more data about the previous request.
        address previousStrategy = getRequestStrategy[execHash];
        bytes memory previousCalldata = getRequestCalldata[execHash];
        uint64 previousGasLimit = getRequestGasLimit[execHash];

        // Generate a new execHash for the resubmitted request.
        systemNonce += 1;
        newExecHash = NovaExecHashLib.compute({
            nonce: systemNonce,
            strategy: previousStrategy,
            l1calldata: previousCalldata,
            gasPrice: gasPrice
        });

        // Fill out data for the resubmitted request.
        getRequestCreator[newExecHash] = msg.sender;
        getRequestStrategy[newExecHash] = previousStrategy;
        getRequestCalldata[newExecHash] = previousCalldata;
        getRequestGasLimit[newExecHash] = previousGasLimit;
        getRequestGasPrice[newExecHash] = gasPrice;
        // Storing the nonce is just for convenience; it does not need to be on-chain.
        getRequestNonce[execHash] = systemNonce;

        // Map the resubmitted request to its uncle.
        getRequestUncle[newExecHash] = execHash;

        // Set the uncled request to expire in MIN_UNLOCK_DELAY_SECONDS.
        getRequestUncleDeathTimestamp[execHash] = switchTimestamp;

        emit SpeedUpRequest(execHash, newExecHash, systemNonce, switchTimestamp);

        // Transfer in additional ETH to pay for the new gas limit.
        ETH.safeTransferFrom(msg.sender, address(this), (gasPrice - previousGasPrice) * previousGasLimit);
    }

    /*///////////////////////////////////////////////////////////////
                  CROSS DOMAIN MESSENGER ONLY FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @dev Distributes inputs/tips to the relayer as a result of a successful execution. Only the linked L1_NovaExecutionManager can call via the cross domain messenger.
    /// @param execHash The computed execHash of the execution.
    /// @param rewardRecipient The address the relayer specified to be the recipient of the tokens on L2.
    /// @param reverted If the strategy reverted on L1 during execution.
    /// @param gasUsed The amount of gas used by the execution tx on L1.
    function execCompleted(
        bytes32 execHash,
        address rewardRecipient,
        bool reverted,
        uint64 gasUsed
    ) external onlyFromCrossDomainAccount(L1_NovaExecutionManagerAddress) {
        // Ensure that the tokens have not already been removed.
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");

        uint256 gasLimit = getRequestGasLimit[execHash];
        uint256 gasPrice = getRequestGasPrice[execHash];
        uint256 tip = getRequestTip[execHash];
        address creator = getRequestCreator[execHash];

        // The amount of ETH to pay for the gas used (capped at the gas limit).
        uint256 gasPayment = gasPrice * (gasUsed > gasLimit ? gasLimit : gasUsed);
        // The amount of ETH to pay as the tip to the rewardRecepient.
        uint256 recipientTip = reverted ? (tip * 7) / 10 : tip;

        // Refund the creator any unused gas + refund some of the tip if reverted
        ETH.safeTransfer(creator, ((gasLimit * gasPrice) - gasPayment) + (tip - recipientTip));
        // Pay the recipient the gas payment + the tip.
        ETH.safeTransfer(rewardRecipient, gasPayment + recipientTip);

        // Give the proper input token recipient the ability to claim the tokens.
        getRequestInputTokenRecipient[execHash].recipient = reverted ? creator : rewardRecipient;

        emit ExecCompleted(execHash, rewardRecipient, reverted, gasUsed);
    }

    /*///////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks if the request has had one of its tokens removed.
    /// @param execHash The request to check.
    /// @return tokensRemoved A boolean indicating if the request has had one of its tokens removed.
    /// @return changeTimestamp A timestamp indicating when the request might have one of its tokens removed or added. Will be 0 if there is no removal/addition expected. It will be a timestamp if the request will have its tokens added soon (it's a resubmitted version of an uncled request).
    function areTokensRemoved(bytes32 execHash) public view returns (bool tokensRemoved, uint256 changeTimestamp) {
        address inputTokenRecipient = getRequestInputTokenRecipient[execHash].recipient;

        if (inputTokenRecipient == address(0)) {
            // This request has not been executed and tokens have not been withdrawn,
            // but it may be a resubmitted request so we need to check its uncle to make sure it has not been executed and it has already died.
            bytes32 uncle = getRequestUncle[execHash];
            if (uncle == "") {
                // This is a normal request, so we know tokens have/will not be removed.
                tokensRemoved = false;
                changeTimestamp = 0;
            } else {
                // This is a resubmitted version of a uncled request, so we have to check if the uncle has "died" yet.
                uint256 uncleDeathTimestamp = getRequestUncleDeathTimestamp[uncle];

                tokensRemoved = uncleDeathTimestamp > block.timestamp; // Tokens are removed for a resubmitted request if the uncled request has not died yet.
                changeTimestamp = tokensRemoved
                    ? uncleDeathTimestamp // Return a timestamp if the request is still waiting to have tokens added.
                    : 0;
            }
        } else {
            // Request has been executed or tokens withdrawn.
            tokensRemoved = true;
            changeTimestamp = 0;
        }
    }

    /// @notice Checks if the request is scheduled to have its tokens unlocked.
    /// @param execHash The request to check.
    /// @return unlocked A boolean indicating if the request has had its tokens unlocked.
    /// @return changeTimestamp A timestamp indicating when the request might have its tokens unlocked. Will be 0 if there is no unlock is scheduled. It will be a timestamp if an unlock has been scheduled.
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
