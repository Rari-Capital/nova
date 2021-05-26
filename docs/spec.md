# The Nova Protocol

- Author(s): transmissions11
- Reviewer(s): platocrat
- Created On: May 25th, 2020

## Problem Summary

- Migrating to L2 is hard. A large percentage of DeFi activity will likely still remain on L1 for a considerable amount of time.
- Users and devs alike want the cheap fees of L2 while still retaining composability with L1.

- A few other projects have attempted to solve this problem with "fast withdrawals" but don't fully meet the needs of most developers.

  - Almost all of the current L2-L1 composability protocols are modeled after systems that were designed for cross-chain swaps and transactions. They don't take advantage of the extra flexibliity and security we inherit from rollups.

    - Many of these solutions rely on [HTLCs](https://www.youtube.com/watch?v=qUAyW4pdooA) which are not unusable directly via contracts as they rely on the active involvement of two parties and critically **the sender's signature (contract's do NOT have signatures!)**

    - Other solutions rely on modified trust assumptions via bonds, etc. These solutions simply do not meet the **ironclad security needs of DeFi developers.**

  - Most importantly every one these past projects do not provide the ultimate flexibility developers desperately need.
    - _They are only useful for transfering tokens between chains/rollups_, but are unable to allow users and contracts to trustlessly read from or write to L1 from the comfort of L2.

## Solution Summary

By utilizing the verifiable nature of [Optimism's cross domain message passing system](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls), **Nova is able to allow users/contracts on L2 to perform transactions on L1 and trustlessly recieve their results**. Nova relies on at least one relayer to execute the transaction on L1, but a relayer can only ignore a transaction— they are unable to tamper with it or change its output. Relayers are reimbursed for the gas they spend and incentivized with additional tips. Nova transactions have meta-transaction level latency (nearly identical to sending the L1 transaction directly to an Ethereum full node) thanks to the [instant confirmations provided by Optimsim's sequencer model](https://research.paradigm.xyz/rollups).

## High Level Overview

The Nova protocol consists of at least 2 contracts. Both of these contracts live on seperate layers, but must have knowledge of each other's addresses on their opposite chains in order to send and validate messages between them. The minimum 2 contracts needed are:

### A "registry" **on L2**

The registry is where users make and manage "requests" (transactions to be executed), and relayers recieve rewards for executing them.

- A "request" is created when a user/contract calls a function on the contract (the official implementation calls this function `requestExec`)

  - The function accepts all the following as arguments:

    - The address of an L1 contract (this is known as the "strategy" contract)
    - The abi encoded calldata to call the "strategy" with
    - How much gas the transaction is expected to take up
    - The gas price they want used to execute the request
    - How much additional wei they want to tip the relayer (can be 0)
    - An array of "input tokens" (l2 token addresses and amounts)
      - Input tokens represent tokens a relayer will need to approve to the execution manager in order to succesfully execute the request on L1.
      - Relayers must front the equivalent tokens themselves on L1 but will recieve their input tokens back on L2 if they successfuly execute the request.
      - Relayers will not recieve their input tokens back if the strategy reverts on L1.
      - Strategy contracts can access input tokens from relayers via a special method in the execution manager.
        - If the relayer does not approve enough input tokens the strategy will cause a "hard revert" which means the entire call will revert (preventing a message from being sent to pay out the relayer and undoing any actions taken by the relayer in the tx).

  - Request creators must approve the amount of WETH neccessary to pay for `(gasPrice * gasLimit) + tip` before making a request.
  - 30% of the tip will be sent back to the request creator if the strategy reverts to incentivize good behavior.
  - The registry will refund the request creator for any gas unused by the call on L1.

- Users and relayers can claim input tokens via a seperate function on the registry.

  - Relayers may call this function after executing a request with input tokens.

    - Input tokens are not transfered immediately to the relayer like tips and gas payments as the ERC20 transfers may waste a lot of gas and drive up the cost of the overhead of the execution manager.

  - Users may call this function if their request reverted on L1 (as in that case tokens are returned to the request creator instead of the relayer).

  - Anyone may call the "claim input tokens" function on behalf of the relayer or user.

- If a user's request is not being executed, they may trigger a token unlock, which sets off a 5 minute countdown (or longer if a user specifies)

  - After the waiting period has passed, anyone is free to call a method on the registry which will withdraw the tokens and send them to the request's creator.
  - If the user's request gets executed during the unlock period, they will not be able to withdraw their tokens.
  - If a user waits out the unlock period but does not withdraw their tokens, a relayer may still execute the request.

- If a user specifies a gas price that is too low, they can speed up their request using a function on the registry.

  - Speeding up a request is much more convenient than unlocking + withdrawing tokens and then recreating the request as it only takes one transaction.

  - The request creator is free to speed up their request at any time by calling a function on the registry. This function immediately begins the minimum 5 minute timeout period, and once 5 minutes have passed the request will be automatically withdrawn from and tokens will be transfered to a matching request with a higher gas price.

  - This function requires that the user approve the additional WETH needed to pay for the higher gas price: `(newGasPrice - previousGasPrice) * gasLimit`

### An "execution manager" **on L1**

The execution manager is what allows the registry to be certian that a request was properly executed.

- Relayers take the calldata and strategy address users post to the registry (after validating the user paid for the right amount of gas, etc) and execute them via the execution manager.

- The execution manager runs the call itself measures the gas used

  - The call may revert, and as long as the revert message is not `__NOVA__HARD__REVERT`, it will still count as a succesful execution and the relayer will be reimbursed the gas they spent.

  - if the call did revert with `__NOVA__HARD__REVERT`, this means the relayer has done something unwanted by the strategy and will cause the call to the execution manager to revert, which means the realeyer will not be reimbursed the gas they spent.

- If the call does not revert with `__NOVA__HARD__REVERT`, the execution manager then calls [`sendMessage` on Optimism's OVM_L1CrossDomainMessenger contract](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls) to send a message to the registry.

  - The message contains a unique identifier for the execution, how much gas was used, if the transaction reverted, and which relayer executed the request.

    - The "unique identifier" is referred to as an "execHash"

    - The execHash is a hash of all relevant factors about the execution (strategy address, calldata, gas price, etc).

    - The execHash is first computed and stored when a request is created on the registry.

      - When a message comes in, the registry can find which request matches the execHash to determine which input tokens to release, etc.

  - The registry can then check that the sender of the message is the execution manager it expects and release the gas payment, etc.

_In summary, these two contracts enable what could be described as "cross-layer meta-transactions" that can be intiated by L2 contracts and users alike._

## External Assumptions

- [Optimism's cross domain message passing system](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls) does not contain any flaws that would allow third parties to tamper with or forge the origin of a message.

- Relayers simulate the end to end proccess of executing a request and receiving the rewards before executing them so they do not attempt to execute malicious requests.

- Relayers specify deadlines of less than 5 minutes when relaying via the execution manager (as to ensure they do not execute a request after its tokens are withdrawn).
