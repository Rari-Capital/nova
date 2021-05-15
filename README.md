<h1 align="center">Nova<br><a href='https://coveralls.io/github/Rari-Capital/nova?branch=master'><img src='https://coveralls.io/repos/github/Rari-Capital/nova/badge.svg?branch=master' alt='Coverage Status' /></a> <a href="https://github.com/Rari-Capital/nova/actions/workflows/tests.yml"><img src="https://github.com/Rari-Capital/nova/actions/workflows/tests.yml/badge.svg"/></a></h1>  

Nova is a **set of contracts** & **network of relayers** that empowers users/contracts to seamlessly interact with L1 contracts + liquidity **without leaving L2** in a trustless and **composable** manner.

---

<p align="center"> Deatiled developer docs are available at: https://docs.rari.capital/nova </h1>

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

## Update Gas Snapshot

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

https://github.com/Rari-Capital/nova/blob/master/.github/workflows/tests.yml#L82-L84
