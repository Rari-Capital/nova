<img width="320" src="/docs/images/white-bg-small.png" alt="Logo">

[![Coverage Status](https://coveralls.io/repos/github/Rari-Capital/nova/badge.svg?branch=master)](https://coveralls.io/github/Rari-Capital/nova?branch=master) [![Fuzz Tests](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml) [![Integration Tests](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml) [![Unit Tests](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml)

Nova gives your **L2 contracts** the power to **read and write to L1** with **minimal latency** and **no trust tradeoffs**.

- [Documentation](https://docs.rari.capital/nova)
- [Relayer Guide](/docs/relayers.md)
- [Whitepaper]()
- [Audit]()

## Architecture

- [`L1_NovaExecutionManager.sol`](/contracts/L1_NovaExecutionManager.sol): Entry point for relayers to execute requests.
- [`L2_NovaRegistry.sol`](/contracts/L2_NovaRegistry.sol): Hub for contracts/users on L2 to create and manage requests.
- [`L1_NovaApprovalEscrow.sol`](/contracts/L1_NovaApprovalEscrow.sol): Escrow contract for relayers to approve input tokens to.
- `libraries/`: Utilities used to help implement the Nova protocol.
  - [`SafeTransferLib.sol`](/contracts/libraries/SafeTransferLib.sol): Library for safely transferring Ether.
  - [`NovaExecHashLib.sol`](/contracts/libraries/NovaExecHashLib.sol): Library for computing a Nova execHash.
- `external/`: Contracts and interfaces modified from external codebases.
  - [`CrossDomainEnabled.sol`](/contracts/external/CrossDomainEnabled.sol): Cross-domain communication helper mixin.

[![Diagram](https://lucid.app/publicSegments/view/b543b380-7aa4-4f55-b1d9-1fe52028300b/image.png)](https://lucid.app/documents/view/dca3b0ad-26ed-42f8-a871-1b03b40a2395)

## Testing

Below is a list of scripts used to test, fuzz, and measure the gas consumption of the Nova smart contracts.
Many of these scripts are run automatically as part of our continuous integration suite.

### Running Unit Tests

To fail tests when their gas snapshots are incorrect (default is only a warning), set the `CI` env var to `true`.

```bash
npm run unit-tests
```

### Running Integration Tests

[You must start up an instance of Optimism's "ops" repo before running integration tests.](https://github.com/ethereum-optimism/optimism/tree/develop/ops)

```bash
npm run integration-tests
```

### Updating Gas Snapshots

If you make a contribution that changes the gas usage of the contracts, you must run this command before committing.

```bash
npm run gas-changed
```

### Running Unit Tests With Coverage

After running tests with coverage, an lcov report will be exported to `coverage/index.html`.

```bash
npm run coverage
```

### Running Integration Tests On Kovan

You must set the `PRIVATE_KEY` and `KOVAN_RPC_URL` environment variables before running integration tests on Kovan.

```bash
npm run kovan-integration-tests
```

### Fuzzing With Echidna

[You must install Echidna before fuzzing.](https://github.com/crytic/echidna#installation)

```bash
npm run fuzz deep {{CONTRACT_NAME}}
```

Replace `{{CONTRACT_NAME}}` with a contract that is fuzzed in `contracts/echidna`. A full list can be found here:

https://github.com/Rari-Capital/nova/blob/master/.github/workflows/fuzz.yml#L13-L14

There are 3 fuzz "modes" setup for this project:

- `deep` enters coverage guided inputs until it is halted manually.

  - It uses coverage guided fuzzing, **which makes it quite slow**.
  - It is the most comprehensive mode (if run for long enough).

- `long` enters random inputs for **5 hours** before halting.

  - It does not use coverage guided fuzzing.
  - Is less comprehensive than `deep`.

- `quick` enters random inputs for **20 minutes** before halting.

  - It does not use coverage guided fuzzing.
  - Is less comprehensive than `long`.

To use any of these modes simply run the command above but replace `deep` with the mode you wish to use (`long`,`quick`, or `deep`).
