# Nova Spec

## Core Concepts

- Users specify what actions they want run on L1 from L2

- Users pay a bounty which pays for the gas of execution on L1 + whatever upfront costs a bot executing on L1 needs to have.

- Bots execute requests on L1 by calling the Nova "Execution Manager" contract (on L1) with the calldata users on L2 give them.

- The execution manager will call a specific strategy contract which can send tokens up to L2 via a bridge.

- After executing a request, the Nova Execution Manager sends a confirmation up to L2 to unlock the bounty for the bot.

<img width="737" alt="Screen Shot 2021-04-12 at 11 26 29 PM" src="https://user-images.githubusercontent.com/26209401/114506366-8ae55200-9be6-11eb-930d-7dc9483b939e.png">

## Core Spec

- L1_NovaExecutionManager:

```solidity
function exec(uint72 execNonce, address strategy, bytes memory l1calldata, uint256 xDomainMessageGasLimit) public
```

This function calls the `strategy` address with the specified `l1calldata`.

The call to `strategy` is wrapped in a try-catch block:

- If the call reverts and the revert message is `__NOVA__HARD__REVERT__`, **`exec` will revert immediately (no message to L2 will be sent).**
  - [This is called a HARD REVERT.](#core-spec)
  - Strategy contracts should only **hard revert** if the bot has not properly set up the execution context (like not approving the right amount input of tokens, etc)
- If the call reverts and the revert message is empty or is not `__NOVA__HARD__REVERT__`, **`exec` will continue with sending a message to L2.**
  - [This is called a SOFT REVERT.](#core-spec)
  - If a strategy **soft reverts**, the `inputTokens` for the request will **not be sent** to the bot and **only 70% of the bounty** will be sent (instead of the usual 100%). The **30% bounty penalty** is to prevent bots from attempting to cause or wait for soft reverts and **act in good faith** instead.

The `execNonce` argument is used to compute the `execHash` needed to unlock the bounty for this strategy on L2.

The `xDomainMessageGasLimit` is used to determine the gas limit used for the cross domain call to `execCompleted`. [A fraction of this gas limit (currently 1/32nd) is consumed by the call to `sendMessage`](https://github.com/ethereum-optimism/contracts/blob/master/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L42)

All computation in the function leading up to the cross domain message is sandwiched between calls to `gasLeft()`. These are used to calculate how many gas units the bot had to pay for (so the registry can **release the proper bounty** on L2). Calculating `gasUsed` is not as simple as the difference between the starting gasLeft value and the final one as we **have to account for constant function-call gas and the costs associated with sending a cross domain message.** Psuedocode for implementing these gas calculations is shown below:

```solidity
uint256 startGas = gasleft();

... call the strategy, etc ...

// Psuedocode estimates for computing how much the `sendMessage` call will cost.
uint256 xDomainMessageGas = (48 * xDomainCalldata.length) + (xDomainMessageGasLimit / 32) + 74000;

// (Constant function call gas) + (Gas diff after calls) + (the amount of gas that will be burned via enqueue + storage/other message overhead)
gasUsed = 21396 + (startGas - gasleft()) + xDomainMessageGas;

... send cross domain message ...
```

After the call to `strategy` is completed, the EM will compute the `execHash` it needs (using the arguments passed into `exec` along with the `tx.gasprice`) and **send a cross domain message** to call the `L2_NovaRegistry`'s `execCompleted` with the neccessary arguments. This will send the `inputTokens`/`bounties` to the caller of `exec` on L2.

Bots cannot call `exec` with arguments that produce an `execHash` which has previously been successfuly executed.

```solidity
function execWithRecipient(uint72 execNonce, address strategy, bytes calldata l1calldata, uint256 xDomainMessageGasLimit, address l2Recipient) external
```

Behaves like `exec` but tells the `L2_NovaRegistry` contract to send the `inputTokens`/`bounties` to the `l2Recipient` on L2 (instead of specifically the bot who calls the function).

```solidity
function hardRevert() external
```

Convenience function that simply runs `revert("__NOVA__HARD__REVERT__")`.

```solidity
function transferFromBot(address token, uint256 amount) external
```

This function transfers tokens the calling bot (the account that called `execute`) has approved to the execution manager to the currently executing `strategy`.

This function will trigger a [HARD REVERT](#core-spec) if the bot executing the current strategy has not approved at least `amount` of `token` to the `L1_NovaExecutionManager` (like `safeTransferFrom`).

Only the currently executing `strategy` can call this function.

---

- L2_NovaRegistry:

```solidity
struct InputToken {
    address l1Token;
    address l2Token;
    uint256 amount;
}

struct Bounty {
    address token;
    uint256 amount;
}
```

```solidity
/// @param strategy The address of the "strategy" contract on L1 a bot should call with `l1calldata`.
/// @param l1calldata The abi encoded calldata a bot should call the `strategy` with on L1.
/// @param gasLimit The gas limit a bot should use on L1.
/// @param gasPrice The gas price a bot should use on L1.
/// @param inputTokens An array of token amounts that a bot will need on L1 to execute the request (`l1Token`s) along with the equivalent tokens that will be returned on L2 (`l2Token`s). `inputTokens` will not be awarded if the `strategy` reverts on L1.
/// @param bounties An array of tokens that will be awarded to the bot who executes the request. Only 50% of the bounty will be paid to the bot if the `strategy` reverts on L1.
function requestExec(address strategy, bytes calldata l1calldata, uint256 gasLimit, uint256 gasPrice, InputToken[] calldata inputTokens, Bounty[] calldata bounties) public returns (bytes32 execHash)
```

This function allows a user to request a strategy to be executed.

It will first increment `execNonce` for the system which is to prevent duplicate execution requests from having the same `execHash`. The nonce is type `uint72` as it can accommodate 7,000,000,000 people requesting an execution every second for 21,000 years before overflowing.

It will then compute the `execHash` (unique identifier of this specific execution request) like so: `keccak256(abi.encodePacked(execNonce, strategy, l1calldata, gasPrice))`.

It will then store `execHash` in a mapping and assign it to all of the arguments this function was passed.

It will then transfer in all the `InputToken`s and `Bounty`s (**all of these inputs/bounties must be approved to the registry by the caller**).

**The bounty is not checked to be sufficient by the registry, it is up to Nova bots to determine which requests are profitable via `getBounty`.**

```solidity
function requestExecWithTimeout(address strategy, bytes calldata l1calldata, uint256 gasLimit, uint256 gasPrice, InputToken[] calldata inputTokens, Bounty[] calldata bounties, uint256 autoCancelDelay) external returns (bytes32 execHash)
```

Behaves exactly like `requestExec` but also calls `cancel` with `autoCancelDelay` automatically. This function is useful for strategies that are likely to cause hard reverts or not be executed for some reason. The user will still have to call `withdraw` once the `autoCancelDelay` timeout completes.

```solidity
function execCompleted(bytes32 execHash, address executor, address rewardRecipient, uint256 gasUsed, bool reverted) external onlyXDomainMessageFromNovaExecutionManager
```

This function can only be called via a message relayed from cross domain messenger with the L1 origin being the `L1_NovaExecutionManager` contract.

The `execHash` gets computed by the `L1_NovaExecutionManager` like so: `keccak256(abi.encodePacked(execNonce, strategy, l1calldata, gasPrice))` and is used to ensure the right calldata **(and gas price)** was used on L1.

[If there is an active sequencer this function will revert if `executor` is not the sequencer.](#mev-extraction)

Once the registry verifies that the `execHash` was previously registered (meaning this execution was valid) & not disabled (via `isDisabled`):

- It will find this `execHash` in the registry's storage and retrieve the `gasPrice` and bounty/inputToken information associated with this execHash.

- It will first pay for the gas cost of L1 execution by calculating the ETH to send to the `bot` using `(gasLimit > gasUsed ? gasUsed : gasLimit) * gasPrice`. Any remaining ETH will be sent back to the user who requested execution (just like how gas is refunded on L1 if the gas limit exceeds gas used).

- It will then loop over all the `inputTokens` and transfer the `amount` of each `l2Token` to either:

  1. The `rewardRecipient` if `reverted` is false.
  2. The request's creator if `reverted` is true.

- It will then loop over all the `bounties` and transfer the `amount` of each `l2Token` to the `rewardRecipient`. **If `reverted` is true it will transfer 30% of the amount back to the request's creator and only 70% to the `rewardRecipient`.**

After all the bounties/inputs have been paid out we will delete the `execHash` from the registry's storage so it cannot be executed again.

```solidity
function cancel(bytes32 execHash, uint256 withdrawDelaySeconds) public
```

This function cancels an execution request. After `cancel` is called the user must wait `withdrawDelaySeconds` before calling `withdraw` to get their bounty, input tokens, etc back. `msg.sender` must be the initiator of execution request the `execHash` links to.

`withdrawDelaySeconds` must be >=300 (5 minutes).

A bot can still execute the request associated with the `execHash` up until the withdraw delay has passed.

A user may call may not call `cancel` a second time on the same `execHash`.

```solidity
function withdraw(bytes32 execHash) external
```

This function gives the request's creator their input tokens, bounty, and gas payment back.

A user cannot call this function unless they have already called `cancel` and waited for at least the `withdrawDelaySeconds` they specified when calling `cancel`.

```solidity
function bumpGas(bytes32 execHash, uint256 gasPrice) external returns (bytes32 newExecHash)
```

`bumpGas` allows a user to increase the gas price for their execution request without having to `cancel`, `withdraw` and call `requestExec` again. Calling this function will initiate a 5 minute delay before disabling the request associated with `execHash` (this is known as the "uncled" request) and enabling an updated version of the request (this is known as the resubmitted request which can be found under `newExecHash`).

A bot can still execute the uncled request associated with the `execHash` up until the delay has passed. If a bot executes the uncled request before the delay has passed the resubmitted request will not be executable after the delay. 

```solidity
function isExecutable(bytes32 execHash) public view returns (bool executable, uint256 changeTimestamp)
```

Returns if the request is executable (`executeable`) along with a timestamp of when that may change (`changeTimestamp`). The `changeTimestamp` will be timestamp indicating when the request might switch from being executable to unexecutable (or vice-versa). Will be 0 if there is no change expected. It will be a timestamp if the request will be enabled soon (as it's a resubmitted version of an uncled request) or the request is being canceled soon.

Bots should call this function before trying to execute a request in the registry.

```solidity
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
```

Returns all relevant data about a request by its `execHash`. 

- The first 6 return items are the parameters passed to `requestExec`. 
- `creator` is the address which called `requestExec` to create this request.
- `uncle` may either be an empty bytestring or the execHash of the uncle of this transaction (the transaction that this resubmitted transaction is cloned from).
- The last two return items are the return values of calling `isExecutable` with `execHash`.

## Example Integration

To integrate **Uniswap** we only need to write one custom contract (a Strategy contract on L1).

- This strategy would have all the same methods as the Uniswap router has
- The `to` parameter of the strategy's methods would be hijacked and not passed into the Uniswap router.
  - The `to` param will be used as the recipient of the tokens on L2.
  - The Uniswap router will be told to send the output tokens back to the `Nova_UniswapStrategy` contract (so it can send them up to L2 via the bridge)
- Each of the methods would require that a bot approve the tokens necessary for the swap to the `L1_NovaExecutionManager`
- The method would call `transferFromBot` to get the input tokens from the bot and then perform the corresponding method call on the Uniswap router.
- The method would then send the output tokens through an Optimism token bridge to the `to` address.

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

    // Transfer in tokens from the bot.
    L1_NovaExecutionManager(msg.sender).transferFromBot(input, amountIn);

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

## MEV Extraction

An important property of Nova is that it is censorship resistant. There is no single "operator" who can execute requests, anyone is free to. Having a competitive landscape of different bots filling orders is important to ensure users can always get their execution requests filled and they are never censored.

However, considering that many of these requests will come with a bounty that is profitable beyond the maximum gas it takes to execute them, it is natural for multiple bots to engage in PGAs to extract profit from as many strategies that they can.

The profits from these PGAs don't go to the Nova platform or users who request execution, they go to **miners** who contribute no value to the protocol.

We can extract the value that would have gone to miners by auctioning off "priority rights" to execute requests for specific strategies (this is also known as a [MEVA](https://ethresear.ch/t/mev-auction-auctioning-transaction-ordering-rights-as-a-solution-to-miner-extractable-value/6788)). Each strategy will have its own sequencer (bot with priority rights) to prevent a sequencer from potentially ignoring a strategy that their bot is not capable of fulfilling executions for. The auctions will function like so:

- Every X hours (configurable) anyone would be able to call `function triggerAuction(address strategy)` on the `L2_NovaRegistry`.
- From there a 5-minute auction would be initiated
- Every bid must be at least 20% greater than the previous bid
- If there is a new bid within the last 1 minute of the auction, the auction timer is extended by 1 minute
- During this 1 minute period the next bid must be at least 40% greater than the previous bid
- If there is another bid in this 1 minute then another 1 minute is added to the timer with the same 40% bid difference requirement **(this repeats until there are no bids in a 1 minute period)**
- The auction winner's bid is taken by the system while all other bids are sent back to their respective bidders.
- The winner is given ownership of an NFT (known as the "priority key") that they can transfer around at will.

The owner of the priority key for each strategy will from here on be referred to as a strategy's "sequencer".

The strategy's sequencer is given a Y (configurable) minute window where **only they** can execute that specific strategy. Any other bot performing an execution for a strategy during its "sequencer window" will not receive the execution request's bounty (the strategy's sequencer will).

After the Y minute window expires for the request any bot is free to execute requests and receive the full bounty.

Users will be able to opt out of giving the strategy sequencer priority when requesting an execution (but will pay a small penalty).

This system not only extracts PGA profits that would have gone to miners, but they are also able to **extract other frontrunning profits** that would have gone to sandwich bots, etc.

- The sequencer effectively has the rights to **reorder transactions** within that 1 minute window
- Importantly, **they can insert their own transactions** inbetween/around them as part of an atomic bundle (via something like a DSProxy).
- Atomic insertion and reoreding rights allow them to take advantage of frontrunning schemes like sandwich attacks without miner/other bot competition.
- Bots bidding in auctions for different strategies will price-in the frontrunning profits they estimate they can extract and adjust their bid accordingly.
  - **Since the profits from these auctions go to the protocol, we have effectively extracted MEV profits that miners/frontrunning bots could have made off of Nova users and brought it back to the protocol instead.**
  - _We can even redistribute the profits we earn from MEVA back to users as a way to reduce costs!_
