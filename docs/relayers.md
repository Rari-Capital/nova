# Relayer Spec

## High Level

Relayers are responsible for detecting new requests in the registry, simulating them, and if they're profitable, executing them. 
Relaying is not as risk free as other forms of on-chain arbitrage because payouts occur on another layer, meaning flashloans can't be used.
However, with this additional risk comes additional reward, as relaying will be far less competitive than liqudations or arbitrage.

## Low Level

[![Flowchart](https://user-images.githubusercontent.com/26209401/128758937-a4284172-e358-4a73-a329-f480d39b9ea4.png)](https://www.zenflowchart.com/docs/view/LPQZOpnelOkQ5dKBzyVX)
