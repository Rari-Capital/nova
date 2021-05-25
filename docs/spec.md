# The Nova Protocol

- Author(s): transmissions11
- Created On: May 25th, 2020

## Problem Summary

- Migrating to L2 is hard. A large percentage of DeFi activity will likely still remain on L1 for a considerable amount of time. 
- Users and devs alike want the cheap fees of L2 while still retaining composability with L1. 

- A few other projects have attempted to solve this problem with "fast withdrawals" or "cross-chain meta-transactions" but they don't meet the full use-cases of most developers.
  - Almost all of the current L2-L1 composability protocols are modeled after systems designed for cross-chain swaps and transactions. They don't take advantage of the extra flexibliity and security we inherit from rollups!

    - Many of these solutions rely on [HTLCs](https://www.youtube.com/watch?v=qUAyW4pdooA) which are not usuable directly via contracts as they rely on the active involvement of two parties and critically **the sender's signature (contract's do NOT have signatures!)**
   
    - Other solutions rely on modified trust assumptions via bonds, etc. These solutions simply do not meet the **ironclad security needs of DeFi developers.**

  - Most importantly every one these past projects do not provide the tools developers desperately need. 
    - _They are only useful for transfering tokens between chains/rollups_, but are unable to allow users and contracts to trustlessly read from or write to L1 from the comfort of L2.

## Simple Summary

By utilizing the verifiable nature of [Optimism's](https://optimism.io) [`enqueue` message passing system](https://community.optimism.io/docs/developers/bridging.html#understanding-contract-calls), **Nova is able to allow users/contracts on L2 to perform transactions on L1 and trustlessly recieve their results**. Nova relies on a relayer to execute the transaction on L1, but a relayer can only ignore a transaction— they are unable to tamper with it or change its output. Nova transactions have meta-transaction level latency (nearly identical to sending the L1 transaction directly to an Ethereum full node) thanks to the [instant confirmations provided by Optimsim's sequencer model](https://research.paradigm.xyz/rollups).
