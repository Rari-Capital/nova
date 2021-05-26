# The Nova Protocol

- Author(s): transmissions11
- Reviewer(s): platocrat
- Created On: May 25th, 2020

## Problem Summary

- Migrating to L2 is hard. A large percentage of DeFi activity will likely still remain on L1 for a considerable amount of time.
- Users and devs alike want the cheap fees of L2 while still retaining composability with L1.

- A few other projects have attempted to solve this problem with "fast withdrawals" but don't fully meet the needs of most developers.

  - Almost all of the current L2-L1 composability protocols are modeled after systems that were designed for cross-chain swaps and transactions. They don't take advantage of the extra flexibliity and security we inherit from rollups.

    - Many of these solutions rely on [HTLCs](https://www.youtube.com/watch?v=qUAyW4pdooA) which are not unusable directly via contracts as they rely on the active involvement of two parties and critically: **the sender's signature (contract's do NOT have signatures!)**

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

  - **Data about the request (calldata, strategy, gas price, etc) are hashed along with a "nonce" assigned to request to generate a unique identifier known as the execHash that will be used to reference the request.**

<p align="center"><img width="480" src="https://www.websequencediagrams.com/files/render?link=pbdgyZ4TVrTket4SYh0QueYoaj6azHfXoNE2ip6ITqxtciOd4H0mPRGJQCPaGA4O"></p>

- Users and relayers can claim input tokens via a seperate function on the registry.

  - Relayers may call this function after executing a request with input tokens.

    - Input tokens are not transfered immediately to the relayer like tips and gas payments as the ERC20 transfers may waste a lot of gas and drive up the cost of the overhead of the execution manager.

  - Users may call this function if their request reverted on L1 (as in that case tokens are returned to the request creator instead of the relayer).

  - Anyone may call the "claim input tokens" function on behalf of the relayer or user.

<p align="center"><img width="480" src="https://www.websequencediagrams.com/files/render?link=6jDCBnCc0fWLq0uG42WmAsZKOEzmxurJ5rhgSE9iNJ0zIwRJPATvVe4uEW8AHD0b"></p>

- If a user's request is not being executed, they may trigger a token unlock, which sets off a 5 minute countdown (or longer if a user specifies)

  - After the waiting period has passed, anyone is free to call a method on the registry which will withdraw the tokens and send them to the request's creator.
  - If the user's request gets executed during the unlock period, they will not be able to withdraw their tokens.
  - If a user waits out the unlock period but does not withdraw their tokens, a relayer may still execute the request.

<p align="center"><img width="480" src="https://www.websequencediagrams.com/files/render?link=0wegpyMVKOotkpQRuqkDbgoCFBD9kyaFtvsyR9jXHmfTWbXHnBOb0L1aIGtfEoXm"></p>

- If a user specifies a gas price that is too low, they can speed up their request using a function on the registry.

  - Speeding up a request is much more convenient than unlocking + withdrawing tokens and then recreating the request as it only takes one transaction.

  - The request creator is free to speed up their request at any time by calling a function on the registry. 
  
  - This function immediately begins the minimum 5 minute timeout period, and once 5 minutes have passed the request will be automatically withdrawn from and tokens will be transfered to a matching request with a higher gas price.
    - The new request (with a higher gas price) is called the "resubmitted" request
    - The old request which is disabled after 5 minutes is known as the "uncled" request

  - This function requires that the user approve the additional WETH needed to pay for the higher gas price: `(newGasPrice - previousGasPrice) * gasLimit`

<p align="center"><img width="480" src="https://www.websequencediagrams.com/files/render?link=lkVgcR0mtXNsw0z7z7BfyswRYENareFL286V3ffIu3uUOYfYEwNhnOIZCpND6bFO"></p>

### An "execution manager" **on L1**

The execution manager is what allows the registry to be certian that a request was properly executed.

- Relayers take the calldata and strategy address users post to the registry (after validating the user paid for the right amount of gas, etc) and execute them via the execution manager. The relayer must also provide the nonce assigned to the request so it can compute the execHash.

  - The execution manager runs the call itself measures the gas used.

    - The call may revert, and as long as the revert message is not `__NOVA__HARD__REVERT__`, it will still count as a succesful execution and the relayer will be reimbursed the gas they spent.

    - If the call did revert with `__NOVA__HARD__REVERT__`, this means the relayer has done something unwanted by the strategy and will cause the call to the execution manager to revert, which means the realeyer will not be reimbursed the gas they spent.

    - If the call does not revert with `__NOVA__HARD__REVERT__`, the execution manager then calls [`sendMessage` on Optimism's OVM_L1CrossDomainMessenger contract](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls) to send a message to the registry.

      - The message contains the computed execHash for this call, how much gas was used, if the transaction reverted, and which relayer executed the request.

    - The registry can then check that the sender of the message is the execution manager it expects and release the gas payment, etc.

  - Relayers may also specify a "deadline" (timestamp representing the absolute latest point they want the transaction run at):
    - This is to protect relayers from abuse by users who might try to unlock and withdraw their tokens before the relayer's transaction makes it on-chain— allowing them to avoid paying the relayer.
    - Relayers should specify deadlines of less than 5 minutes in the future when they attempt a relay (as to ensure they do not execute a request after its tokens are withdrawn). 

<p align="center"><img width="780" src="https://www.websequencediagrams.com/files/render?link=rJZQgiiPyTBoRDgWNJWLiyI4FHb4VDnCTLFIO9dCPMdUPW5oIIaBE7qVH14lgBY6"></p>


- Strategy contracts may wish to access "input tokens" from the relayer via the `transferFromRelayer(address token, uint256 amount)` function present on the execution manager contract.
  - This function will attempt to transferFrom `amount` of `token` to the calling strategy.
  - If the relayer has not approved `amount` of `token` to the execution manager, the execution manager will revert with `__NOVA__HARD__REVERT__`
  - If caller is not the currently executing strategy the function will revert with `NOT_EXECUTING`.

<p align="center"><img width="480" src="https://www.websequencediagrams.com/files/render?link=vGYrHNrMgthxIyrBh5nhj960WQdxd4AAGvhwT8DuEMJd6Z8hN9NngFz19lIsVSGe"></p>

_In summary, these two contracts enable what could be described as "cross-layer meta-transactions" that can be intiated by L2 contracts and users alike._

## External Assumptions

- [Optimism's cross domain message passing system](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls) does not contain any flaws that would allow third parties to tamper with or forge the origin of a message.

- Relayers simulate the end to end proccess of executing a request and receiving the rewards before executing them so they do not attempt to execute malicious requests.

- Relayers specify deadlines of less than 5 minutes when relaying via the execution manager (as to ensure they do not execute a request after its tokens are withdrawn).

- Relayers are coordinating off-chain to ensure that multiple relayers don't try to execute the same request. Our initial implementation of the Nova protocol will use a team-controlled whitelist to ensure a group of trusted relayers are coordinated, but future iterations could use cryptoeconomic incentivies or leader election auctions to prevent coordination issues from occuring.
