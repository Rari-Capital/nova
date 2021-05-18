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
import "./NovaExecHash.sol";

contract L2_NovaRegistry is DSAuth, OVM_CrossDomainEnabled, NovaExecHash, ReentrancyGuard, Multicall {
    using OVM_SafeERC20 for IERC20;

    /// @notice The minimum delay between when `cancel` and `withdraw` can be called.
    uint256 public constant MIN_CANCEL_SECONDS = 300;

    /// @notice The ERC20 users must use to pay for the L1 gas usage of request.
    IERC20 public immutable ETH;

    /// @notice The address of the only contract authorized to make cross domain calls to `execCompleted`.
    address public L1_NovaExecutionManagerAddress;

    /// @param _ETH An ERC20 ETH you would like users to pay for gas with.
    /// @param _messenger The L2 xDomainMessenger contract you want to use to recieve messages.
    constructor(address _ETH, address _messenger) OVM_CrossDomainEnabled(_messenger) {
        ETH = IERC20(_ETH);
    }

    /// @notice Authorizes the `_L1_NovaExecutionManagerAddress` to make cross domain calls to `execCompleted`.
    /// @notice Each call to `connectExecutionManager` overrides the previous value, you cannot have multiple authorized execution managers at once.
    /// @param _L1_NovaExecutionManagerAddress The address to be authorized to make cross domain calls to `execCompleted`.
    function connectExecutionManager(address _L1_NovaExecutionManagerAddress) external auth {
        L1_NovaExecutionManagerAddress = _L1_NovaExecutionManagerAddress;
    }

    /// @notice Emitted when `cancel` is called.
    /// @param timestamp When the cancel will set into effect and the creator will be able to withdraw.
    event Cancel(bytes32 indexed execHash, uint256 timestamp);

    /// @notice Emitted when `withdraw` is called.
    event Withdraw(bytes32 indexed execHash);

    /// @notice Emitted when `requestExec` is called.
    event Request(bytes32 indexed execHash, address indexed strategy);

    /// @notice Emitted when `bumpGas` is called.
    /// @param newExecHash The execHash of the resubmitted request (copy of its uncle with an updated gasPrice).
    /// @param timestamp When the uncled request (`execHash`) will have its tokens transfered to the resubmitted request (`newExecHash`).
    event BumpGas(bytes32 indexed execHash, bytes32 indexed newExecHash, uint256 timestamp);

    /// @notice Emitted when `execCompleted` is called.
    event ExecCompleted(bytes32 indexed execHash, address indexed rewardRecipient, uint256 gasUsed, bool reverted);

    /// @notice A token/amount pair that a relayer will need on L1 to execute the request (and will be returned to them on L2).
    /// @param l2Token The token on L2 to transfer to the executor upon a successful execution.
    /// @param amount The amount of the `l2Token` to the executor upon a successful execution (scaled by the `l2Token`'s decimals).
    /// @dev Relayers may have to reference a registry/list of some sort to determine the equivalent L1 token they will need.
    /// @dev The decimal scheme may not align between the L1 and L2 tokens, a relayer should check via off-chain logic.
    struct InputToken {
        IERC20 l2Token;
        uint256 amount;
    }

    /// @dev The most recent nonce assigned to an execution request.
    uint256 private systemNonce;

    /// @dev Maps execHashes to the creator of each request.
    mapping(bytes32 => address) public getRequestCreator;
    /// @dev Maps execHashes to the address of the strategy associated with the request.
    mapping(bytes32 => address) public getRequestStrategy;
    /// @dev Maps execHashes to the calldata associated with the request.
    mapping(bytes32 => bytes) public getRequestCalldata;
    /// @dev Maps execHashes to the gas limit a relayer should use to execute the request.
    mapping(bytes32 => uint64) public getRequestGasLimit;
    /// @dev Maps execHashes to the gas price a relayer must use to execute the request.
    mapping(bytes32 => uint256) public getRequestGasPrice;
    /// @dev Maps execHashes to the additional tip in wei relayers will receive for executing them.
    mapping(bytes32 => uint256) public getRequestTip;
    /// @dev Maps execHashes to the input tokens a relayer must have to execute the request.
    mapping(bytes32 => InputToken[]) public getRequestInputTokens;
    /// @dev Maps execHashes to the nonce of each request.
    /// @dev This is just for convenience, does not need to be on-chain.
    mapping(bytes32 => uint256) public getRequestNonce;

    /// @dev Maps execHashes to a timestamp representing when the request has/will have its tokens unlocked, meaning the creator can withdraw their bounties/inputs.
    mapping(bytes32 => uint256) public getRequestTokenUnlockTimestamp;

    /// @dev Maps execHashes to a timestamp representing when the request has/will have its tokens removed (via bumpGas/withdraw/execCompleted).
    /// @dev If the request has had its tokens removed via withdraw or execCompleted it will have a timestamp of 1.
    /// @dev If the request will have its tokens removed in the future (via bumpGas) it will be a standard timestamp.
    mapping(bytes32 => uint256) public getRequestTokenRemovalTimestamp;

    /// @dev Maps execHashes which represent resubmitted requests (via bumpGas) to their corresponding "uncled" request's execHash.
    /// @dev An uncled request is a request that has had its tokens removed via `bumpGas` in favor of a resubmitted request generated in the transaction.
    mapping(bytes32 => bytes32) public getRequestUncle;

    /// @param strategy The address of the "strategy" contract on L1 a relayer should call with `calldata`.
    /// @param l1calldata The abi encoded calldata a relayer should call the `strategy` with on L1.
    /// @param gasLimit The gas limit a relayer should use on L1.
    /// @param gasPrice The gas price (in wei) a relayer should use on L1.
    /// @param tip The additional wei to pay as a tip for any relayer that executes this request.
    /// @param inputTokens An array of 5 or less token/amount pairs that a relayer will need on L1 to execute the request (and will be returned to them on L2). `inputTokens` will not be awarded if the `strategy` reverts on L1.
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
        execHash = computeExecHash({
            nonce: systemNonce,
            strategy: strategy,
            l1calldata: l1calldata,
            gasPrice: gasPrice
        });

        emit Request(execHash, strategy);

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
            getRequestInputTokens[execHash][i] = inputTokens[i];
        }
    }

    /// @notice Calls `requestExec` with all relevant parameters along with calling `cancel` with the `autoCancelDelay` argument.
    /// @dev See `requestExec` and `cancel` for more information.
    function requestExecWithTimeout(
        address strategy,
        bytes calldata l1calldata,
        uint64 gasLimit,
        uint256 gasPrice,
        uint256 tip,
        InputToken[] calldata inputTokens,
        uint256 autoCancelDelay
    ) external returns (bytes32 execHash) {
        execHash = requestExec(strategy, l1calldata, gasLimit, gasPrice, tip, inputTokens);

        cancel(execHash, autoCancelDelay);
    }

    /// @notice Cancels a request with a delay. Once the delay has passed anyone may call `withdraw` on behalf of the user to recieve their bounties/input tokens back.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to cancel.
    /// @param withdrawDelaySeconds The delay in seconds until the creator can withdraw their tokens. Must be greater than or equal to `MIN_CANCEL_SECONDS`.
    function cancel(bytes32 execHash, uint256 withdrawDelaySeconds) public auth {
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        require(getRequestTokenUnlockTimestamp[execHash] == 0, "ALREADY_UNLOCKED");
        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");
        require(withdrawDelaySeconds >= MIN_CANCEL_SECONDS, "DELAY_TOO_SMALL");

        // Set the delay timestamp to (current timestamp + the delay)
        uint256 timestamp = block.timestamp + withdrawDelaySeconds;
        getRequestTokenUnlockTimestamp[execHash] = timestamp;

        emit Cancel(execHash, timestamp);
    }

    /// @notice Withdraws tokens (input/gas/bounties) from a canceled strategy.
    /// @notice The creator of the request associated with `execHash` must call `cancel` and wait the `withdrawDelaySeconds` they specified before calling `withdraw`.
    /// @notice Anyone may call this method on behalf of another user but the tokens will still go the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to withdraw from.
    function withdraw(bytes32 execHash) external nonReentrant auth {
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        (bool canceled, ) = isCanceled(execHash);
        require(canceled, "NOT_CANCELED");

        emit Withdraw(execHash);

        address creator = getRequestCreator[execHash];
        InputToken[] memory inputTokens = getRequestInputTokens[execHash];

        // Store that the request has had its tokens removed.
        getRequestTokenRemovalTimestamp[execHash] = 1;

        // Transfer the ETH which would have been used for (gas + tip) back to the creator.
        ETH.transfer(creator, (getRequestGasPrice[execHash] * getRequestGasLimit[execHash]) + getRequestTip[execHash]);

        // Transfer input tokens back to the creator.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.transfer(creator, inputTokens[i].amount);
        }
    }

    /// @notice Resubmit a request with a higher gas price.
    /// @notice This will "uncle" the `execHash` which means after `MIN_CANCEL_SECONDS` it will be disabled and the `newExecHash` will be enabled.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The execHash of the request you wish to resubmit with a higher gas price.
    /// @param gasPrice The updated gas price to use for the resubmitted request.
    function bumpGas(bytes32 execHash, uint256 gasPrice) external auth returns (bytes32 newExecHash) {
        (bool executable, ) = isExecutable(execHash);
        require(executable, "NOT_EXECUTABLE");

        uint256 previousGasPrice = getRequestGasPrice[execHash];

        require(getRequestCreator[execHash] == msg.sender, "NOT_CREATOR");
        require(gasPrice > previousGasPrice, "LESS_THAN_PREVIOUS_GAS_PRICE");

        address previousStrategy = getRequestStrategy[execHash];
        bytes memory previousCalldata = getRequestCalldata[execHash];
        uint64 previousGasLimit = getRequestGasLimit[execHash];

        // Generate a new execHash for the resubmitted request.
        systemNonce += 1;
        newExecHash = computeExecHash({
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
        getRequestNonce[execHash] = systemNonce;

        // Map the resubmitted request to its uncle.
        getRequestUncle[newExecHash] = execHash;

        // Set the uncled request to expire in MIN_CANCEL_SECONDS.
        uint256 switchTimestamp = MIN_CANCEL_SECONDS + block.timestamp;
        getRequestTokenRemovalTimestamp[execHash] = switchTimestamp;

        emit BumpGas(execHash, newExecHash, switchTimestamp);

        // Transfer in additional ETH to pay for the new gas limit.
        ETH.safeTransferFrom(msg.sender, address(this), (gasPrice - previousGasPrice) * previousGasLimit);
    }

    /// @dev Distributes inputs/tips to the executor as a result of a successful execution. Only the linked L1_NovaExecutionManager can call via the cross domain messenger.
    /// @param execHash The computed execHash of the execution.
    /// @param rewardRecipient The address the executor specified to be the recipient of the tokens on L2.
    /// @param gasUsed The amount of gas used by the execution tx on L1.
    /// @param reverted If the strategy reverted on L1 during execution.
    function execCompleted(
        bytes32 execHash,
        address rewardRecipient,
        uint64 gasUsed,
        bool reverted
    ) external nonReentrant onlyFromCrossDomainAccount(L1_NovaExecutionManagerAddress) {
        (bool executable, ) = isExecutable(execHash);
        require(executable, "NOT_EXECUTABLE");

        uint256 gasLimit = getRequestGasLimit[execHash];
        uint256 gasPrice = getRequestGasPrice[execHash];
        uint256 tip = getRequestTip[execHash];

        // The amount of ETH to pay for the gas used (capped at the gas limit).
        uint256 gasPayment = gasPrice * (gasUsed > gasLimit ? gasLimit : gasUsed);
        // The amount of ETH to pay as the tip to the rewardRecepient.
        uint256 recipientTip = reverted ? (tip * 7) / 10 : tip;

        // Refund the creator any unused gas + refund some of the tip if reverted
        ETH.transfer(getRequestCreator[execHash], ((gasLimit * gasPrice) - gasPayment) + (tip - recipientTip));
        // Pay the recipient the gas payment + the tip.
        ETH.transfer(rewardRecipient, gasPayment + recipientTip);

        // Store that the request has had its tokens removed.
        getRequestTokenRemovalTimestamp[execHash] = 1;

        emit ExecCompleted(execHash, rewardRecipient, gasUsed, reverted);

        // Only transfer input tokens if the request didn't revert.
        if (!reverted) {
            InputToken[] memory inputTokens = getRequestInputTokens[execHash];

            // Calculate how much gas to allocate for each transfer (allocate evenly per inputToken but leave a buffer for safety).
            uint256 perTransferGas = (gasleft() - 5000) / inputTokens.length;

            // Loop over each input token to attempt to transfer it to the recipient.
            for (uint256 i = 0; i < inputTokens.length; i++) {
                try
                    // Make a transfer with a specific amount of gas so we cant run out of gas, and wrap it in a try-catch so it can't revert.
                    inputTokens[i].l2Token.transfer{gas: perTransferGas}(rewardRecipient, inputTokens[i].amount)
                {} catch {}
            }
        }
    }

    /// @notice Returns if the request is executable along with a timestamp of when that may change.
    /// @return executable A boolean indicating if the request is executable.
    /// @return changeTimestamp A timestamp indicating when the request might switch from being executable to unexecutable (or vice-versa). Will be 0 if there is no change expected. It will be a timestamp if the request will be enabled soon (it's a resubmitted version of an uncled request) or the request is being canceled soon.
    function isExecutable(bytes32 execHash) public view returns (bool executable, uint256 changeTimestamp) {
        if (getRequestCreator[execHash] == address(0)) {
            // This isn't a valid execHash!
            executable = false;
            changeTimestamp = 0;
        } else {
            (bool tokensRemoved, uint256 tokensRemovedChangeTimestamp) = areTokensRemoved(execHash);
            (bool canceled, uint256 canceledChangeTimestamp) = isCanceled(execHash);

            executable = !tokensRemoved && !canceled;

            // One or both of these values will be 0 so we can just add them.
            changeTimestamp = canceledChangeTimestamp + tokensRemovedChangeTimestamp;
        }
    }

    /// @notice Checks if the request is currently canceled along with a timestamp of when it may be canceled.
    /// @return tokensRemoved A boolean indicating if the request has been canceled.
    /// @return changeTimestamp A timestamp indicating when the request might have its tokens removed or added. Will be 0 if there is no removal/addition expected. It will be a timestamp if the request will have its tokens added soon (it's a resubmitted version of an uncled request).
    function areTokensRemoved(bytes32 execHash) public view returns (bool tokensRemoved, uint256 changeTimestamp) {
        uint256 removalTimestamp = getRequestTokenRemovalTimestamp[execHash];

        if (removalTimestamp == 0) {
            bytes32 uncle = getRequestUncle[execHash];

            // Check if this request is a resubmitted version of an uncled request.
            if (uncle.length == 0) {
                // This is a normal request, so we know tokens have/will not been removed.
                tokensRemoved = false;
                changeTimestamp = 0;
            } else {
                // This is a resubmitted version of a uncled request, so we have to check if the uncle has had its tokens removed,
                // if so, this request has its tokens.
                uint256 uncleDeathTimestamp = getRequestTokenRemovalTimestamp[uncle];

                if (uncleDeathTimestamp == 1) {
                    // The uncle request has had its tokens removed early.
                    tokensRemoved = true;
                    changeTimestamp = 0;
                } else {
                    // The uncled request may still be waiting for its tokens to be removed.
                    tokensRemoved = block.timestamp < uncleDeathTimestamp; // Tokens are removed for a resubmitted request if the uncled request has not had its tokens removed yet.
                    changeTimestamp = tokensRemoved
                        ? uncleDeathTimestamp // Return a timestamp if the request is still waiting to have tokens added.
                        : 0;
                }
            }
        } else {
            // Tokens have/will be removed.
            tokensRemoved = block.timestamp >= removalTimestamp; // Tokens are removed if the current timestamp is greater than the removal timestamp.
            changeTimestamp = tokensRemoved ? 0 : removalTimestamp; // Return a timestamp if the tokens have not been removed yet.
        }
    }

    /// @notice Checks if the request is currently canceled along with a timestamp of when it may be canceled.
    /// @return canceled A boolean indicating if the request has been canceled.
    /// @return changeTimestamp A timestamp indicating when the request might be canceled. Will be 0 if there is no cancel expected. It will be a timestamp if a cancel has been requested.
    function isCanceled(bytes32 execHash) public view returns (bool canceled, uint256 changeTimestamp) {
        uint256 cancelTimestamp = getRequestTokenUnlockTimestamp[execHash];

        if (cancelTimestamp == 0) {
            // There has been no cancel attempt.
            canceled = false;
            changeTimestamp = 0;
        } else {
            // There has been a cancel attempt.
            canceled = block.timestamp >= cancelTimestamp;
            changeTimestamp = canceled ? 0 : cancelTimestamp;
        }
    }
}
