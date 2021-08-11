# Relayer Spec

## High Level

Relayers are responsible for detecting new requests in the registry, simulating them, and if they're profitable, executing them. 
Relaying is not as risk free as other forms of on-chain arbitrage because payouts occur on another layer, meaning flashloans can't be used.
However, with this additional risk comes additional reward, as relaying will be far less competitive than liqudations or arbitrage.

## Low Level

[![Flowchart](https://user-images.githubusercontent.com/26209401/128758937-a4284172-e358-4a73-a329-f480d39b9ea4.png)](https://www.zenflowchart.com/docs/view/LPQZOpnelOkQ5dKBzyVX)

1. Watch for `RequestExec` events in the `L2_NovaRegistry`: https://github.com/Rari-Capital/nova/blob/master/contracts/L2_NovaRegistry.sol#L69

3. Simulate a call to `exec` on the `L1_NovaExecutionManager` (with the proper input tokens for the request approved): https://github.com/Rari-Capital/nova/blob/master/contracts/L1_NovaExecutionManager.sol#L132

5. Call to `exec` on the `L1_NovaExecutionManager` (with the proper input tokens for the request approved) for real: https://github.com/Rari-Capital/nova/blob/master/contracts/L1_NovaExecutionManager.sol#L132

7. Wait 20 blocks for the request to be relayed (this delay is built into Optimism's cross domain messaging service, we cannot avoid it)

9. Claim input tokens if neccessary: https://github.com/Rari-Capital/nova/blob/master/contracts/L2_NovaRegistry.sol#L269

### Gotchas

- Strategy contracts might use wildly different amounts of gas depending on part of the chain's state. If chain state changes signifcantly between the simulation and when the `exec` transaction is included on chain, the relayer could end up overpaying for a transaction. **(THIS IS BEING FIXED)**

- Strategy contracts may trigger a "hard revert" at any time, so be cautious of arbitrary strategies.
