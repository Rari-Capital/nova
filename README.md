# Nova

[![Coverage Status](https://coveralls.io/repos/github/Rari-Capital/nova/badge.svg?branch=master)](https://coveralls.io/github/Rari-Capital/nova?branch=master) [![Fuzz Tests](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/fuzz.yml) [![Integration Tests](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/integration-tests.yml) [![Unit Tests](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/Rari-Capital/nova/actions/workflows/unit-tests.yml) [![Nova Docs](https://img.shields.io/badge/Developer%20Docs-up%20to%20date-31C151?labelColor=333941&logo=github&logoColor=949DA5)](https://docs.rari.capital/nova)

Nova is a **set of contracts** & **network of relayers** that empowers users/contracts to seamlessly interact with L1 contracts + liquidity **without leaving L2** in a trustless and **composable** manner.

## Resources

- **[Developer docs + integration guide](https://docs.rari.capital/nova)**

- [Technical specification/whitepaper](/docs/spec.md)

---

<img align="right" src="https://user-images.githubusercontent.com/26209401/116805216-c5e9ef80-aad9-11eb-81c8-06dcb2468c9c.png" alt="drawing" width="500"/>

## Unit Tests

```bash
npm run unit-tests
```

## Unit Tests With Coverage

```bash
npm run coverage
```

## Update Gas Snapshots

```bash
npm run gas-changed
```

## Integration Tests
[You must start up an instance of Optimism's "ops" repo before running integration tests.](https://github.com/ethereum-optimism/optimism/tree/develop/ops)

```bash
npm run integration-tests
```

## Fuzz With Echidna
[You must install Echidna before fuzzing.](https://github.com/crytic/echidna#installation)

```bash
npm run fuzz {{CONTRACT_NAME}}
```
Replace `{{CONTRACT_NAME}}` with the name of a contract that is fuzzed in `contracts/echidna`. A full list can be found here:

https://github.com/Rari-Capital/nova/blob/master/.github/workflows/fuzz.yml#L12-L14
