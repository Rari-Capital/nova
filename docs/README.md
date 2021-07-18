# Nova

**Nova is a <u>set of contracts</u> & <u>network of relayers</u> that enable seamless <u>L1-L2 interop</u> in a <u>trustless</u> and <u>composable</u> manner.**

<img width="500" style="float: right;" alt="Explainer" src="https://i.imgur.com/TbbAhLd.png">

- L2 contracts "request execution" of an L1 contract's function(s)

- L2 contracts provide a bounty which pays for the gas of execution on L1 + whatever upfront costs a relayer needs to endure.

- Relayers execute requests on L1 by calling the Nova "Execution Manager" contract with the calldata contracts on L2 give them.

- The execution manager will call the specified "strategy contract" which may send tokens up to L2 via a bridge.

- After executing a request, the Nova Execution Manager sends a confirmation up to L2 to unlock the bounty for the relayer.

**[Read our whitepaper/technical specification to learn more!](https://github.com/rari-capital/nova/blob/master/docs/spec.md)**

## L2_NovaRegistry

This is the primary contract users and contracts will be interacting with. L2 users/contracts can use this contract to [request execution of different strategies](#request-execution), [unlock their tokens](#unlock-tokens), [withdraw their tokens](#withdraw-tokens), and [speed up their requests](#speed-up-a-request).

Relayers will use this contract to view the latest requests, [receive tips for executing requests](#complete-execution-request) and [claim input tokens](#claim-input-tokens).

### Request execution

```solidity
/// @notice A token/amount pair that a relayer will need on L1 to execute the request (and will be returned to them on L2).
/// @param l2Token The token on L2 to transfer to the relayer upon a successful execution.
/// @param amount The amount of the `l2Token` to the relayer upon a successful execution (scaled by the `l2Token`'s decimals).
/// @dev Relayers may have to reference a registry/list of some sort to determine the equivalent L1 token they will need.
/// @dev The decimal scheme may not align between the L1 and L2 tokens, a relayer should check via off-chain logic.
struct InputToken {
    IERC20 l2Token;
    uint256 amount;
}

function requestExec(address strategy, bytes calldata l1calldata, uint256 gasLimit, uint256 gasPrice, uint256 tip, InputToken[] calldata inputTokens) public returns (bytes32 execHash)
```

- `strategy`: The address of the "strategy" contract on L1 a relayer should call with `l1calldata`.

- `l1calldata`: The abi encoded calldata a relayer should call the `strategy` with on L1.

- `gasLimit`: The gas limit a relayer should use on L1.

- `gasPrice`: The gas price a relayer should use on L1.

- `tip`: The additional wei to pay as a tip for any relayer that executes this request.

- `inputTokens`: An array of 5 or less token/amount pairs that a relayer will need on L1 to execute the request (and will be returned to them on L2).

- **`RETURN`: The "execHash" (unique identifier) for this request.**

This function allows a user/contract to request a strategy to be executed with specific calldata.

::: tip
This function may consume a fair bit of gas as it transfers multiple ERC20s at once.
:::

The caller must approve all `inputTokens` to the registry as well as approving enough WETH to pay for `(gasLimit * gasPrice) + tip`.

### Request execution with a timeout

```solidity
function requestExecWithTimeout(address strategy, bytes calldata l1calldata, uint256 gasLimit, uint256 gasPrice, uint256 tip, InputToken[] calldata inputTokens, uint256 autoUnlockDelay) external returns (bytes32 execHash)
```

- `strategy`: [See `requestExec`.](#request-execution)

- `l1calldata`: [See `requestExec`.](#request-execution)

- `gasLimit`: [See `requestExec`.](#request-execution)

- `gasPrice`: [See `requestExec`.](#request-execution)

- `tip`: [See `requestExec`.](#request-execution)

- `inputTokens`: [See `requestExec`.](#request-execution)

- `autoUnlockDelay`: [See `unlockTokens`.](#unlock-tokens)

- **`RETURN`: [See `requestExec`.](#request-execution)**

Behaves exactly like [`requestExec`](#request-execution) but also calls [`unlockTokens`](#unlock-tokens) with `autoUnlockDelay` automatically.

::: warning
The user will still have to call [`withdrawTokens`](#withdraw-tokens) once the `autoUnlockDelay` timeout completes.
:::

This function is useful for strategies that are likely to cause hard reverts or not be executed for some reason.

### Unlock tokens

```solidity
function unlockTokens(bytes32 execHash, uint256 unlockDelaySeconds) public
```

- `execHash`: The unique hash of the request to unlock.

- `unlockDelaySeconds`: The delay in seconds until the creator can withdraw their tokens. Must be greater than or equal to `MIN_UNLOCK_DELAY_SECONDS`.

This function starts a countdown which lasts for `unlockDelaySeconds`. After the delay is passed a user is allowed to withdraw their tip/inputs via [`withdrawTokens`](#withdraw-tokens).

`msg.sender` must be the initiator of execution request the `execHash` links to.

::: tip
After [`unlockTokens`](#unlock-tokens) is called the user must wait `unlockDelaySeconds` before calling [`withdrawTokens`](#withdraw-tokens) to get their tip, input tokens, etc back.
:::

::: warning
`unlockDelaySeconds` must be >=300 (5 minutes).
:::

A relayer can still execute the request associated with the `execHash` until [`withdrawTokens`](#withdraw-tokens) is called.

A user may call may not call [`unlockTokens`](#unlock-tokens) a second time on the same `execHash`.

### Withdraw tokens

```solidity
function withdrawTokens(bytes32 execHash) external
```

- `execHash`: The unique hash of the request to withdraw from.

This function gives the request's creator their input tokens, tip, and gas payment back.

The creator of the request associated with `execHash` must call [`unlockTokens`](#unlock-tokens) and wait the `unlockDelaySeconds` they specified before calling [`withdrawTokens`](#withdraw-tokens).

::: tip
This function may consume a fair bit of gas as it transfers multiple ERC20s at once.
:::

Anyone may call this function, but the tokens will still go the creator of the request associated with the `execHash`.

### Speed up a request

```solidity
function speedUpRequest(bytes32 execHash, uint256 gasPrice) external returns (bytes32 newExecHash)
```

- `execHash`: The execHash of the request you wish to resubmit with a higher gas price.

- `gasPrice`: The updated gas price to use for the resubmitted request in wei.

- **`RETURN`: The "newExecHash" (unique identifier) for the resubmitted request.**

This function allows a user/contract to increase the gas price for a request they've created.

Calling this function will initiate a 5 minute delay before disabling the request associated with `execHash` (this is known as the "uncled" request) and enabling an updated version of the request (this is known as the resubmitted request which is returned as `newExecHash`).

The caller must be the creator of the `execHash` and must also approve enough extra WETH to pay for the increased gas costs: `(gasPrice - previousGasPrice) * previousGasLimit`.

::: danger
A relayer can still execute the uncled request associated with the `execHash` up until the delay has passed.
:::

If a relayer executes the uncled request before the delay has passed the resubmitted request will not be executable after the delay.

### Relock tokens

```solidity
function relockTokens(bytes32 execHash) external
```

- `execHash`: The unique hash of the request which has an unlock scheduled.

Cancels a scheduled unlock triggered via [`unlockTokens`](#unlock-tokens).

The caller must be the creator of the request.

### Claim input tokens

```solidity
function claimInputTokens(bytes32 execHash) external
```

- `execHash`: The hash of the executed request.

Claims input tokens earned from executing a request. Request creators must also call this function if their request reverted to claim their input tokens (as input tokens are not sent to relayers if the request reverts).

::: tip
This function may consume a fair bit of gas as it transfers multiple ERC20s at once.
:::

Anyone may call this function, but the tokens will be sent to the proper input token recipient (either the l2Recpient given in `execCompleted` or the request creator if the request reverted).

### Check if tokens are removed

```solidity
function areTokensRemoved(bytes32 execHash) public view returns (bool tokensRemoved, uint256 changeTimestamp)
```

- `execHash`: The unique identifier for the request to check.

- **`RETURN`: Tuple of 2 values (are tokens removed, when that may change). `changeTimestamp` will be 0 if no removal/addition is scheduled to occur.**

::: tip
Relayers should call this function before trying to execute a request in the registry.
:::

Checks if the request has had its tokens removed. Returns if the tokens have been removed along with a timestamp of when they may be added or removed.

- Tokens may start out removed, if so `tokensRemoved` will be true and `changeTimestamp` will be in the future and represent when tokens will be added. If this is the case you know the request is a resubmitted request created via [`speedUpRequest`](#speed-up-a-request).

- Tokens may be scheduled to be removed, if so `tokensRemoved` will be false and `changeTimestamp` will be in the future and represent when the tokens will be removed. If this is the case you know the request is an uncled request— updated via [`speedUpRequest`](#speed-up-a-request).

- Tokens may be already removed or added, in which case `changeTimestamp` will be 0.

### Check if tokens are unlocked

```solidity
function areTokensUnlocked(bytes32 execHash) public view returns (bool unlocked, uint256 changeTimestamp)
```

- `execHash`: The unique identifier for the request to check.

- **`RETURN`: Tuple of 2 values (is unlocked, when that may change). `changeTimestamp` will be 0 if no future unlock is scheduled.**

::: tip
Relayers should call this function before trying to execute a request in the registry.
:::

Checks if the request is scheduled to have its tokens unlocked. Returns if tokens are unlocked yet along with a timestamp of when they are scheduled to be unlocked (if the creator has called [`unlockTokens`](#unlock-tokens)).

### Complete execution request

```solidity
function execCompleted(bytes32 execHash, address rewardRecipient, uint256 gasUsed, bool reverted) external onlyXDomainMessageFromNovaExecutionManager
```

::: danger NOT DIRECTLY CALLABLE
This function can only be called via a message relayed from cross domain messenger with the L1 origin being the `L1_NovaExecutionManager` contract.
:::

The `execHash` gets computed by the `L1_NovaExecutionManager` like so: `keccak256(abi.encodePacked(nonce, strategy, l1calldata, gasPrice))` and is used to ensure the right calldata **(and gas price)** was used on L1.

Once the registry verifies that the `execHash` was previously registered (meaning this execution was valid) and tokens are not removed:

- It will find this `execHash` in the registry's storage and retrieve the `gasPrice` and tip/inputToken information associated with this execHash.

- It will first pay for the gas cost of L1 execution by calculating the ETH to send to the `relayer` using `(gasLimit > gasUsed ? gasUsed : gasLimit) * gasPrice`. Any remaining ETH will be sent back to the user who requested execution (just like how gas is refunded on L1 if the gas limit exceeds gas used).

- It will then send the `rewardRecipient` the tip. If the request reverted, the recipient will only receive 50% of the tip and the creator will be refunded the remaining portion. **This is to incentivize relayers to act honestly.**

- If the request did not revert, the `rewardRecipient` will be marked as the input token recipient for this request so they can claim the input tokens via [`claimInputTokens`](#claim-input-tokens). If the request reverted the creator of the request will be marked as the input token recipient.

Lastly it will mark `execHash` as executed so it cannot be executed again.

### Get request info

There are quite a few public functions to get details about a request.

They are all implemented as public mappings (which generate a function with the mapping's name which takes its key as a parameter and returns what the key maps to):

```solidity
/// @notice Maps execHashes to the creator of each request.
mapping(bytes32 => address) public getRequestCreator;

/// @notice Maps execHashes to the address of the strategy associated with the request.
mapping(bytes32 => address) public getRequestStrategy;

/// @notice Maps execHashes to the calldata associated with the request.
mapping(bytes32 => bytes) public getRequestCalldata;

/// @notice Maps execHashes to the gas limit a relayer should use to execute the request.
mapping(bytes32 => uint256) public getRequestGasLimit;

/// @notice Maps execHashes to the gas price a relayer must use to execute the request.
mapping(bytes32 => uint256) public getRequestGasPrice;

/// @notice Maps execHashes to the additional tip in wei relayers will receive for executing them.
mapping(bytes32 => uint256) public getRequestTip;
```

---

## L1_NovaExecutionManager

Users on L2 never need to interact with this contract. This contract is to facilitate the execution of requests and send messages to unlock input tokens/tip for relayers/relayers (post-execution).

Strategy contracts may wish to call back into this contract to trigger a [hard revert](#trigger-hard-revert), [get the current execHash](#get-the-current-exechash) or [transfer tokens from the relayer](#transfer-tokens-from-the-relayer).

### Execute Request

```solidity
function exec(uint256 nonce, address strategy, bytes memory l1calldata, address l2Recipient) public
```

This function calls the `strategy` address with the specified `l1calldata`.

The call to `strategy` is wrapped in a try-catch block:

- If the call reverts and the revert message is `__NOVA__HARD__REVERT__`, **[`exec`](#execute-request) will revert immediately (no message to L2 will be sent).**
  - [This is called a HARD REVERT.](#execute-request)
  - Strategy contracts should only **hard revert** if the relayer has not properly set up the execution context (like not approving the right amount input of tokens, etc)
- If the call reverts and the revert message is empty or is not `__NOVA__HARD__REVERT__`, **[`exec`](#execute-request) will continue with sending a message to L2.**
  - [This is called a SOFT REVERT.](#execute-request)
  - If a strategy **soft reverts**, the `inputTokens` for the request will **not be sent** to the relayer and **only 50% of the tip** will be sent (instead of the usual 100%). The **50% tip penalty** is to prevent relayers from attempting to cause or wait for soft reverts and **act in good faith** instead.

This function also keeps track of how much gas is consumed by the strategy and [`exec`](#execute-request) itself.

Once the strategy is executed this function sends a cross domain message to call [`execCompleted`](#complete-execution-request) on the registry.

### Trigger Hard Revert

```solidity
function hardRevert() external
```

Convenience function that simply runs `revert("__NOVA__HARD__REVERT__")`.

### Get The Current ExecHash

```solidity
function currentExecHash() external view returns (bytes32)
```

This function returns the execHash computed from the current call to [`exec`](#execute-request). Strategy contracts may wish to call this function to send messages up to L2 with and tag them with the current execHash.

### Get The Current Relayer

```solidity
function currentRelayer() external view returns (address)
```

This function returns the current "relayer" (address that made the current call to [`exec`](#execute-request)). Strategy contrats may wish to call this function to ensure only a trusted party is able to execute the strategy or to release additional rewards for the relayer, etc.

### Transfer Tokens From The Relayer

```solidity
function transferFromRelayer(address token, uint256 amount) external
```

This function transfers tokens the calling relayer (the account that called [`exec`](#execute-request)) has approved to the execution manager to the currently executing `strategy`.

::: danger
Only the currently executing `strategy` can call this function.
:::

This function will trigger a [HARD REVERT](#execute-request) if the relayer executing the current strategy has not approved at least `amount` of `token` to the `L1_NovaExecutionManager` (like `safeTransferFrom`).

## Example Integration(s)

### Uniswap/Sushiswap

To integrate **Uniswap/Sushiswap** we only need to write one custom contract (a Strategy contract on L1).

- This strategy would have all the same functions as the Uniswap router has
- The `to` parameter of the strategy's functions would be hijacked and not passed into the Uniswap router.
  - The `to` param will be used as the recipient of the tokens on L2.
  - The Uniswap router will be told to send the output tokens back to the `Nova_UniswapStrategy` contract (so it can send them up to L2 via the bridge)
- Each of the functions would require that a relayer approve the tokens necessary for the swap to the `L1_NovaExecutionManager`
- The function would call [`transferFromRelayer`](#transfer-tokens-from-the-relayer) to get the input tokens from the relayer and then perform the corresponding function call on the Uniswap router.
- The function would then send the output tokens through an Optimism token bridge to the `to` address.

**Here's what one of those wrapped router functions in the Strategy contract would look like:**

```solidity
function swapExactTokensForTokens(
  uint256 amountIn,
  uint256 amountOutMin,
  address[] calldata path,
  address to,
  uint256 deadline
) external {
  ERC20 input = ERC20(path[0]);
  ERC20 output = ERC20(path[path.length - 1]);

  // Transfer in tokens from the relayer.
  L1_NovaExecutionManager(msg.sender).transferFromRelayer(input, amountIn);

  // Approve the input tokens to the uniswapRouter
  input.approve(address(uniswapRouter), amountIn);

  // Perform the swap
  uniswapRouter.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    path,
    address(this),
    deadline
  );
  uint256 outputAmount = output.balanceOf(address(this));

  // Approve the output tokens to the token bridge
  output.approve(address(optimismTokenBridge), outputAmount);
  // Send the tokens up to L2 with the recipient being the `to` param
  optimismTokenBridge.depositAsERC20(address(output), to, outputAmount);
}

```
