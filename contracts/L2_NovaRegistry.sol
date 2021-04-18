// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@eth-optimism/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";

contract L2_NovaRegistry is ReentrancyGuard, OVM_CrossDomainEnabled {
    using SafeERC20 for IERC20;

    IERC20 immutable ETH = IERC20(0x4200000000000000000000000000000000000006);
    uint256 immutable MIN_CANCEL_SECONDS = 300;
    address immutable L1_NovaExecutionManager;

    constructor(address _L1_NovaExecutionManager)
        OVM_CrossDomainEnabled(0x4200000000000000000000000000000000000007)
    {
        L1_NovaExecutionManager = _L1_NovaExecutionManager;
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
    event BumpGas(
        bytes32 indexed execHash,
        bytes32 indexed newExecHash,
        uint256 timestamp
    );

    /// @notice Emitted when `execCompleted` is called.
    event ExecCompleted(
        bytes32 indexed execHash,
        address indexed executor,
        address indexed rewardRecipient,
        uint256 gasUsed,
        bool reverted
    );

    struct InputToken {
        IERC20 l2Token;
        address l1Token;
        uint256 amount;
    }

    struct Bounty {
        IERC20 token;
        uint256 amount;
    }

    /// @dev The most recent nonce assigned to an execution request.
    uint72 private systemNonce;

    /// @dev Maps execHashes to the creator of each request.
    mapping(bytes32 => address) private requestCreators;
    /// @dev Maps execHashes to the address of the strategy associated with the request.
    mapping(bytes32 => address) private requestStrategies;
    /// @dev Maps execHashes to the calldata associated with the request.
    mapping(bytes32 => bytes) private requestCalldatas;
    /// @dev Maps execHashes to the gas limit a bot should use to execute the request.
    mapping(bytes32 => uint256) private requestGasLimits;
    /// @dev Maps execHashes to the gas price a bot must use to execute the request.
    mapping(bytes32 => uint256) private requestGasPrices;
    /// @dev Maps execHashes to the 'bounty' tokens a bot will recieve for executing the request.
    mapping(bytes32 => Bounty[]) private requestBounties;
    /// @dev Maps execHashes to the input tokens a bot must have to execute the request.
    mapping(bytes32 => InputToken[]) private requestInputTokens;

    /// @dev Maps execHashes to a timestamp representing when the request has/will have its tokens removed (via bumpGas/withdraw/execCompleted).
    /// @dev If the request has had its tokens removed via withdraw or execCompleted it will have a timestamp of 1.
    /// @dev If the request will have its tokens removed in the future (via bumpGas) it will be a standard timestamp.
    mapping(bytes32 => uint256) private requestTokenRemovalTimestamps;

    /// @dev Maps execHashes to a timestamp representing when the request is fully canceled and the creator can withdraw their bounties/inputs.
    /// @dev Bots should not attempt to execute a request if the current time has passed its cancel timestamp.
    mapping(bytes32 => uint256) private requestCancelTimestamps;

    /// @dev Maps execHashes which represent resubmitted requests (via bumpGas) to their corresponding "uncled" request's execHash.
    /// @dev An uncled request is a request that has had its tokens removed via `bumpGas` in favor of a resubmitted request generated in the transaction.
    mapping(bytes32 => bytes32) private uncles;

    /// @notice Returns all relevant data about a specific request.
    function getRequestData(bytes32 execHash)
        external
        view
        returns (
            // General request data:
            address strategy,
            bytes memory l1calldata,
            uint256 gasLimit,
            uint256 gasPrice,
            InputToken[] memory inputTokens,
            Bounty[] memory bounties,
            // Other data:
            address creator,
            bytes32 uncle,
            // Can be fetched via `isExecutable`:
            bool executable,
            uint256 changeTimestamp
        )
    {
        strategy = requestStrategies[execHash];
        l1calldata = requestCalldatas[execHash];
        gasLimit = requestGasLimits[execHash];
        gasPrice = requestGasPrices[execHash];
        inputTokens = requestInputTokens[execHash];
        bounties = requestBounties[execHash];
        creator = requestCreators[execHash];
        uncle = uncles[execHash];

        (executable, changeTimestamp) = isExecutable(execHash);
    }

    /// @param strategy The address of the "strategy" contract on L1 a bot should call with `calldata`.
    /// @param l1calldata The abi encoded calldata a bot should call the `strategy` with on L1.
    /// @param gasLimit The gas limit a bot should use on L1.
    /// @param gasPrice The gas price a bot should use on L1.
    /// @param inputTokens An array of token amounts that a bot will need on L1 to execute the request (`l1Token`s) along with the equivalent tokens that will be returned on L2 (`l2Token`s). `inputTokens` will not be awarded if the `strategy` reverts on L1.
    /// @param bounties An array of tokens that will be awarded to the bot who executes the request. Only 50% of the bounty will be paid to the bot if the `strategy` reverts on L1.
    function requestExec(
        address strategy,
        bytes calldata l1calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        InputToken[] calldata inputTokens,
        Bounty[] calldata bounties
    ) public nonReentrant returns (bytes32 execHash) {
        systemNonce += 1;
        execHash = keccak256(
            abi.encodePacked(systemNonce, strategy, l1calldata, gasPrice)
        );

        requestStrategies[execHash] = strategy;
        requestCalldatas[execHash] = l1calldata;
        requestGasLimits[execHash] = gasLimit;
        requestGasPrices[execHash] = gasPrice;
        requestCreators[execHash] = msg.sender;

        // Transfer in ETH to pay for max gas usage.
        ETH.safeTransferFrom(msg.sender, address(this), gasPrice * gasLimit);

        // Transfer input tokens in that the msg.sender has approved.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransferFrom(
                msg.sender,
                address(this),
                inputTokens[i].amount
            );

            // Copy over this index to the requestInputTokens mapping (we can't just put a calldata/memory array directly into storage so we have to go index by index).
            requestInputTokens[execHash][i] = inputTokens[i];
        }

        // Transfer bounties in that the msg.sender has approved.
        for (uint256 i = 0; i < bounties.length; i++) {
            bounties[i].token.safeTransferFrom(
                msg.sender,
                address(this),
                bounties[i].amount
            );

            // Copy over this index to the requestBounties mapping (we can't just put a calldata/memory array directly into storage so we have to go index by index).
            requestBounties[execHash][i] = bounties[i];
        }

        emit Request(execHash, strategy);
    }

    /// @notice Calls `requestExec` with all relevant parameters along with calling `cancel` with the `autoCancelDelay` argument.
    /// @dev See `requestExec` and `cancel` for more information.
    function requestExecWithTimeout(
        address strategy,
        bytes calldata l1calldata,
        uint256 gasLimit,
        uint256 gasPrice,
        InputToken[] calldata inputTokens,
        Bounty[] calldata bounties,
        uint256 autoCancelDelay
    ) external returns (bytes32 execHash) {
        execHash = requestExec(
            strategy,
            l1calldata,
            gasLimit,
            gasPrice,
            inputTokens,
            bounties
        );

        cancel(execHash, autoCancelDelay);
    }

    /// @notice Cancels a request with a delay. Once the delay has passed anyone may call `withdraw` on behalf of the user to recieve their bounties/input tokens back.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to cancel.
    /// @param withdrawDelaySeconds The delay in seconds until the creator can withdraw their tokens. Must be greater than or equal to `MIN_CANCEL_SECONDS`.
    function cancel(bytes32 execHash, uint256 withdrawDelaySeconds) public {
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        require(requestCancelTimestamps[execHash] == 0, "ALREADY_CANCELED");
        require(requestCreators[execHash] == msg.sender, "NOT_CREATOR");
        require(withdrawDelaySeconds >= MIN_CANCEL_SECONDS, "DELAY_TOO_SMALL");

        // Set the delay timestamp to int(current timestamp + the delay)
        uint256 timestamp = block.timestamp + withdrawDelaySeconds;
        requestCancelTimestamps[execHash] = timestamp;

        emit Cancel(execHash, timestamp);
    }

    /// @notice Withdraws tokens (input/gas/bounties) from a canceled strategy.
    /// @notice The creator of the request associated with `execHash` must call `cancel` and wait the `withdrawDelaySeconds` they specified before calling `withdraw`.
    /// @notice Anyone may call this method on behalf of another user but the tokens will still go the creator of the request associated with the `execHash`.
    /// @param execHash The unique hash of the request to withdraw from.
    function withdraw(bytes32 execHash) external nonReentrant {
        (bool tokensRemoved, ) = areTokensRemoved(execHash);
        require(!tokensRemoved, "TOKENS_REMOVED");
        (bool canceled, ) = isCanceled(execHash);
        require(canceled, "NOT_CANCELED");

        address creator = requestCreators[execHash];
        InputToken[] memory inputTokens = requestInputTokens[execHash];
        Bounty[] memory bounties = requestBounties[execHash];

        // Store that the request has had its tokens removed.
        requestTokenRemovalTimestamps[execHash] = 1;

        // Transfer the ETH which would have been used for gas back to the creator.
        ETH.transfer(
            creator,
            requestGasPrices[execHash] * requestGasLimits[execHash]
        );

        // Transfer input tokens back to the creator.
        for (uint256 i = 0; i < inputTokens.length; i++) {
            inputTokens[i].l2Token.safeTransfer(creator, inputTokens[i].amount);
        }
        // Transfer bounties back to the creator.
        for (uint256 i = 0; i < bounties.length; i++) {
            bounties[i].token.safeTransfer(creator, bounties[i].amount);
        }

        emit Withdraw(execHash);
    }

    /// @notice Resubmit a request with a higher gas price.
    /// @notice This will "uncle" the `execHash` which means after `MIN_CANCEL_SECONDS` it will be disabled and the `newExecHash` will be enabled.
    /// @notice msg.sender must be the creator of the request associated with the `execHash`.
    /// @param execHash The execHash of the request you wish to resubmit with a higher gas price.
    /// @param gasPrice The updated gas price to use for the resubmitted request.
    function bumpGas(bytes32 execHash, uint256 gasPrice)
        external
        returns (bytes32 newExecHash)
    {
        (bool executable, ) = isExecutable(execHash);
        require(executable, "NOT_EXECUTABLE");
        uint256 previousGasPrice = requestGasPrices[execHash];
        require(requestCreators[execHash] == msg.sender, "NOT_CREATOR");
        require(gasPrice > previousGasPrice, "LESS_THAN_PREVIOUS_GAS_PRICE");

        // Generate a new execHash for the resubmitted request.
        systemNonce += 1;
        newExecHash = keccak256(
            abi.encodePacked(
                systemNonce,
                requestStrategies[execHash],
                requestCalldatas[execHash],
                gasPrice
            )
        );

        uint256 gasLimit = requestGasLimits[execHash];

        // Fill out data for the resubmitted request.
        requestStrategies[newExecHash] = requestStrategies[execHash];
        requestCalldatas[newExecHash] = requestCalldatas[execHash];
        requestGasLimits[newExecHash] = gasLimit;
        requestGasPrices[newExecHash] = gasPrice;
        requestCreators[newExecHash] = msg.sender;

        // Map the resubmitted request to its uncle.
        uncles[newExecHash] = execHash;

        // Set the uncled request to expire in MIN_CANCEL_SECONDS.
        uint256 switchTimestamp = MIN_CANCEL_SECONDS + block.timestamp;
        requestTokenRemovalTimestamps[execHash] = switchTimestamp;

        // Transfer in additional ETH to pay for the new gas limit.
        ETH.safeTransferFrom(
            msg.sender,
            address(this),
            (gasPrice - previousGasPrice) * gasLimit
        );

        emit BumpGas(execHash, newExecHash, switchTimestamp);
    }

    function execCompleted(
        bytes32 execHash,
        address executor,
        address rewardRecipient,
        uint256 gasUsed,
        bool reverted
    )
        external
        nonReentrant
        onlyFromCrossDomainAccount(L1_NovaExecutionManager)
    {
        (bool executable, ) = isExecutable(execHash);
        require(executable, "NOT_EXECUTABLE");

        // Store that the request has had its tokens removed.
        requestTokenRemovalTimestamps[execHash] = 1;

        InputToken[] memory inputTokens = requestInputTokens[execHash];
        Bounty[] memory bounties = requestBounties[execHash];

        // Transfer the ETH used for gas to the rewardRecipient.
        ETH.transfer(
            rewardRecipient,
            requestGasPrices[execHash] *
                (
                    // Don't give them any more ETH than the gas limit
                    gasUsed > requestGasLimits[execHash]
                        ? requestGasLimits[execHash]
                        : gasUsed
                )
        );

        // Only transfer input tokens if the request didn't revert.
        if (!reverted) {
            // Transfer input tokens to the rewardRecipient.
            for (uint256 i = 0; i < inputTokens.length; i++) {
                inputTokens[i].l2Token.safeTransfer(
                    rewardRecipient,
                    inputTokens[i].amount
                );
            }

            // Transfer full bounty back to the rewardRecipient.
            for (uint256 i = 0; i < bounties.length; i++) {
                bounties[i].token.safeTransfer(
                    rewardRecipient,
                    bounties[i].amount
                );
            }
        } else {
            address creator = requestCreators[execHash];

            // Transfer input tokens back to the creator.
            for (uint256 i = 0; i < inputTokens.length; i++) {
                inputTokens[i].l2Token.safeTransfer(
                    creator,
                    inputTokens[i].amount
                );
            }

            // Transfer 70% of the bounty to the rewardRecipient and 30% back to the creator.
            for (uint256 i = 0; i < bounties.length; i++) {
                IERC20 token = bounties[i].token;
                uint256 bountyFullAmount = bounties[i].amount;
                uint256 recipientAmount = (bountyFullAmount * 7) / 10;

                token.safeTransfer(
                    rewardRecipient,
                    // 70% goes to the rewardRecipient:
                    recipientAmount
                );

                token.safeTransfer(
                    creator,
                    // Remainder goes to the creator:
                    bountyFullAmount - recipientAmount
                );
            }
        }

        emit ExecCompleted(
            execHash,
            executor,
            rewardRecipient,
            gasUsed,
            reverted
        );
    }

    /// @notice Checks if the request is executable along with a timestamp of when that may change.
    /// @return executable A boolean indicating if the request is executable.
    /// @return changeTimestamp A timestamp indicating when the request might switch from being executable to unexecutable (or vice-versa). Will be 0 if there is no change expected. It will be a timestamp if the request will be enabled soon (it's a resubmitted version of an uncled request) or the request is being canceled soon.
    function isExecutable(bytes32 execHash)
        public
        view
        returns (bool executable, uint256 changeTimestamp)
    {
        if (requestCreators[execHash] == address(0)) {
            // This isn't a valid execHash!
            executable = false;
            changeTimestamp = 0;
        } else {
            (bool tokensRemoved, uint256 tokensRemovedChangeTimestamp) =
                areTokensRemoved(execHash);
            (bool canceled, uint256 canceledChangeTimestamp) =
                isCanceled(execHash);

            executable = !tokensRemoved && !canceled;

            // One or both of these values will be 0 so we can just add them.
            changeTimestamp =
                canceledChangeTimestamp +
                tokensRemovedChangeTimestamp;
        }
    }

    /// @notice Checks if the request is currently canceled along with a timestamp of when it may be canceled.
    /// @return tokensRemoved A boolean indicating if the request has been canceled.
    /// @return changeTimestamp A timestamp indicating when the request might have its tokens removed or added. Will be 0 if there is no removal/addition expected. It will be a timestamp if the request will have its tokens added soon (it's a resubmitted version of an uncled request).
    function areTokensRemoved(bytes32 execHash)
        public
        view
        returns (bool tokensRemoved, uint256 changeTimestamp)
    {
        uint256 removalTimestamp = requestTokenRemovalTimestamps[execHash];

        if (removalTimestamp == 0) {
            bytes32 uncle = uncles[execHash];

            // Check if this request is a resubmitted version of an uncled request.
            if (uncle.length == 0) {
                // This is a normal request, so we know tokens have/will not been removed.
                tokensRemoved = false;
                changeTimestamp = 0;
            } else {
                // This is a resubmitted version of a uncled request, so we have to check if the uncle has had its tokens removed,
                // if so, this request has its tokens.
                uint256 uncleDeathTimestamp =
                    requestTokenRemovalTimestamps[uncle];

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
    function isCanceled(bytes32 execHash)
        public
        view
        returns (bool canceled, uint256 changeTimestamp)
    {
        uint256 cancelTimestamp = requestCancelTimestamps[execHash];

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
