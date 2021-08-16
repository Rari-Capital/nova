<img width="320" src="/docs/images/white-bg-small.png" alt="Logo">

[![Coverage Status](https://coveralls.io/repos/github/Rari-Capital/nova/badge.svg?branch=master)](https://coveralls.io/github/Rari-Capital/nova?branch=master) [![Fuzz Tests](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml) [![Integration Tests](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml) [![Unit Tests](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml)

Nova gives your **L2 contracts** the power to **read and write to L1** with **minimal latency** and **no trust tradeoffs**.

- [Documentation](https://docs.rari.capital/nova)
- [Relayer Guide](/docs/relayers.md)
- [Whitepaper]()

## Architecture

- `contracts/`: Solidity smart contracts implementing the Nova protocol.
  - [`L1_NovaExecutionManager.sol`](/contracts/L1_NovaExecutionManager.sol): Entry point for relayers to execute requests.
  - [`L2_NovaRegistry.sol`](/contracts/L2_NovaRegistry.sol): Hub for contracts/users on L2 to create and manage requests.
  - `libraries/`: Utilities used to help implement the Nova protocol.
    - [`SafeTransferLib`](/libraries/SafeTransferLib.sol): Library for safely transferring Ether. 
    - [`NovaExecHashLib`](/libraries/NovaExecHashLib.sol): Library for computing a Nova execHash.
    - [`SigLib`](/libraries/SigLib.sol): Library for extracing the signature of an abi-encoded function call.
  - `external/`: Contracts and interfaces modified from external codebases.
    - [`CrossDomainEnabled`](/libraries/CrossDomainEnabled.sol): Mixin for contracts performing cross-domain communications.

[![Diagram](https://lucid.app/publicSegments/view/70e70068-38f5-49db-9107-243a7a77e812/image.png)](https://lucid.app/documents/view/dca3b0ad-26ed-42f8-a871-1b03b40a2395)
