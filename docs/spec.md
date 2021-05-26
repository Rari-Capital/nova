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

By utilizing the verifiable nature of [Optimism's](https://optimism.io) [`enqueue` message passing system](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls), **Nova is able to allow users/contracts on L2 to perform transactions on L1 and trustlessly recieve their results**. Nova relies on a relayer to execute the transaction on L1, but a relayer can only ignore a transaction— they are unable to tamper with it or change its output. Nova transactions have meta-transaction level latency (nearly identical to sending the L1 transaction directly to an Ethereum full node) thanks to the [instant confirmations provided by Optimsim's sequencer model](https://research.paradigm.xyz/rollups).

## Abstract

### Nova consists of at least 2 contracts:
- A "registry" **on L2**

  - The registry is where users make "requests" (post transactions to be executed), and relayers recieve rewards for executing them. 
  - A "request" is created when a user/contract calls a function on the contract (the official implementation calls this function `requestExec`) with:
    - The address of an L1 contract (this is known as the "strategy" contract)
    - The abi encoded calldata to call the "strategy" with
    - How much gas the transaction is expected to take up 
    - The gas price they want used to execute the request
  - Request creators must approve the amount of WETH neccessary to pay for `gasPrice * gasLimit` before making a request. 
  - Request creators may optionally specify "input tokens" which they must provide for the relayer like gas.
    - Input tokens represent tokens a relayer will need to approve to the execution manager in order to succesfully execute the request on L1. 
    - Relayers must front input tokens themselves but will recieve their input tokens back on L2 if they successfuly execute a request.
    - Relayers will not recieve their input tokens back if the strategy reverts on L1.
    - Strategy contracts can access input tokens from relayers via a special method in the execution manager.
    - If the relayer does not approve enough input tokens the strategy will cause a "hard revert" which means the entire call will revert (preventing a message from being sent to pay out the relayer and undoing any actions taken by the relayer in the tx).

  - The registry also coordinates releasing tokens to relayers, allowing users to withdraw their requests after a delay, speeding up their requests, etc. 

- An "execution manager" **on L1**

  - The execution manager is what allows the registry to be certian that a request was properly executed. 
  - Relayers take the calldata and strategy address users post to the registry (after validating the user paid for the right amount of gas, etc) and execute them via the execution manager. 
  - The execution manager runs the call itself measures the gas used 
    - The call may revert, and as long as the revert message is not `__NOVA__HARD__REVERT`, it will still count as a succesful execution and the relayer will be reimbursed the gas they spent.
    - if the call did revert with `__NOVA__HARD__REVERT`, this means the relayer has done something unwanted by the strategy and will cause the call to the execution manager to revert, which means the realeyer will not be reimbursed the gas they spent.
  - If the call does not revert with `__NOVA__HARD__REVERT`, the execution manager then calls [`enqueue`](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls) on [Optimism's "Canonical Transaction Chain"](https://community.optimism.io/docs/protocol/protocol.html#chain-contracts) contract to send a message to the registry. 
    - The message contains a unique identifier for the execution, how much gas was used, if the transaction reverted, and which relayer executed the request. 
      - The unique identifier is a hash of all relevant factors about the execution (strategy address, calldata, gas price, etc). 
      - The identifier can be precomputed on the registry, and when a message comes in, the registry knows that if the unique identifier matches one already present in the registry, it was properly executed. 
    - The registry can then check that the sender of the message is the execution manager it expects and release the gas payment, etc. 

### In summary, these two contracts enable what could be described as "cross-layer meta-transactions" that can be intiated by L2 contracts and users alike.

