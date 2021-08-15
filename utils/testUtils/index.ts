import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import chalk from "chalk";
import ora from "ora";
import hre, { ethers } from "hardhat";
import {
  BigNumberish,
  Contract,
  ContractFactory,
  ContractReceipt,
  ContractTransaction,
} from "ethers";
import { Interface, ParamType } from "ethers/lib/utils";

import { IERC20 } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/** Returns a valid value for a param type. */
export function getValueForParamType(paramType: ParamType) {
  const baseType = paramType.baseType;

  if (baseType === "array") {
    return [];
  } else if (baseType === "tuple") {
    let obj = {};
    for (const subParam of paramType.components) {
      obj[subParam.name] = getValueForParamType(subParam);
    }
    return obj;
  } else if (baseType === "address") {
    return "0xFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACE";
  } else if (baseType === "bool") {
    return true;
  } else if (baseType.includes("bytes")) {
    if (baseType === "bytes") {
      return "0x00000000";
    }
    const numberOfBytes = parseInt(baseType.replace("bytes", ""));
    return ethers.utils.hexZeroPad("0x00000000", numberOfBytes);
  } else if (baseType.includes("uint")) {
    if (baseType === "uint") {
      return 1e18;
    }
    const numberSize = parseInt(baseType.replace("uint", ""));
    return Math.min(100000000000, Math.floor(2 ** numberSize / 100));
  } else if (baseType.includes("int")) {
    if (baseType === "int") {
      return 1e18;
    }
    const numberSize = parseInt(baseType.replace("int", ""));
    return Math.min(100000000000, Math.floor(2 ** numberSize / 100));
  }
}

/** Calls all stateful functions in a contract to check if they revert with unauthorized.  */
export async function checkAllFunctionsForAuth(
  contract: Contract,
  account: SignerWithAddress,
  ignoreNames?: string[]
) {
  const statefulFragments = getAllStatefulFragments(contract.interface);

  for (const fragment of statefulFragments) {
    if (ignoreNames?.includes(fragment.name)) {
      continue;
    }

    await contract
      .connect(account)
      [fragment.name](...fragment.inputs.map(getValueForParamType))
      .should.be.revertedWith("UNAUTHORIZED");
  }
}

/** Returns an array of function fragments that are stateful from an interface. */
export function getAllStatefulFragments(contractInterface: Interface) {
  return Object.values(contractInterface.functions).filter((f) => !f.constant);
}

/** Gets an ethers factory for a contract. T should be the typechain factory type of the contract (ie: MockERC20__factory). */
export function getFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
}

export function getOVMFactory<T extends ContractFactory>(
  name: string,
  l2: boolean,
  path?: string
): T {
  const artifact = require(`../../artifacts${l2 ? "-ovm" : ""}/contracts/${
    path ?? ""
  }${name}.sol/${name}.json`);

  return new ethers.ContractFactory(artifact.abi, artifact.bytecode) as any;
}

/** Increases EVM time by `seconds` and mines a new block. */
export async function increaseTimeAndMine(seconds: BigNumberish) {
  await ethers.provider.send("evm_increaseTime", [parseInt(seconds.toString())]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Records the gas usage of a transaction, and checks against the most recent saved Jest snapshot.
 * If not in CI mode it won't stop tests (just show a console log).
 * To update the Jest snapshot run `npm run gas-changed`
 */
export async function snapshotGasCost(x: Promise<ContractTransaction>) {
  // Only check gas estimates if we're not in coverage mode, as gas estimates are messed up in coverage mode.
  if (!process.env.HARDHAT_COVERAGE_MODE_ENABLED) {
    let receipt: ContractReceipt = await (await x).wait();
    try {
      receipt.gasUsed.toNumber().should.toMatchSnapshot();
    } catch (e) {
      console.log(
        chalk.red(
          "(CHANGE) " +
            e.message
              .replace("expected", "used")
              .replace("to equal", "gas, but the snapshot expected it to use") +
            " gas"
        )
      );

      if (process.env.CI) {
        return Promise.reject("reverted: Gas consumption changed from expected.");
      }
    }
  }

  return x;
}

/**
 * Checkpoints `user`'s ether `token` balance upon calling.
 * Returns two functions (calcIncrease and calcDecrease,
 * calling calcIncrease will return the  `user`'s new `token`
 * balance minus the starting balance. Calling calcDecrease
 * subtracts the final balance from the balance.
 * */
export async function checkpointBalance(token: IERC20, user: string) {
  const startingBalance = await token.balanceOf(user);

  async function calcIncrease() {
    const finalBalance = await token.balanceOf(user);

    return finalBalance.sub(startingBalance);
  }

  async function calcDecrease() {
    const finalBalance = await token.balanceOf(user);

    return startingBalance.sub(finalBalance);
  }

  return [calcIncrease, calcDecrease];
}

/**
 * Waits for a cross domain message originating on L1 to be relayed on L2.
 */
export async function waitForL1ToL2Relay(l1Tx: Promise<ContractTransaction>, watcher: any) {
  console.log();

  const loader = ora({
    text: chalk.grey(`waiting for L1 -> L2 cross domain message to be relayed\n`),
    color: "yellow",
    indent: 6,
  }).start();

  const res = await l1Tx;
  await res.wait();

  const [l1ToL2XDomainMsgHash] = await watcher.getMessageHashesFromL1Tx(res.hash);

  const receipt: ContractReceipt = await watcher.getL2TransactionReceipt(l1ToL2XDomainMsgHash);

  loader.stopAndPersist({
    symbol: chalk.yellow("✓"),
    text: chalk.gray(
      `relay completed on L2 for cross domain message: ${chalk.yellow(receipt.transactionHash)}\n`
    ),
  });

  loader.indent = 0;
  loader.stop();
}

/**
 * Deploys a contract and if it's on a network that has etherscan, logs info on how to verify it on Etherscan.
 */
export async function deployAndLogVerificationInfo<T extends ContractFactory>(
  factory: T,
  ...args: Parameters<T["deploy"]>
): Promise<ReturnType<T["deploy"]>> {
  const chainID = await factory.signer.getChainId();
  const [networkName] = Object.entries(hre.config.networks).find(
    ([, config]) => config.chainId == chainID
  );

  // We can add 69 and 10 to this once Hardhat fixes OE verification:
  const shouldPrintVerifyInfo = chainID == 1 || chainID == 42;

  if (shouldPrintVerifyInfo) {
    console.log();
  }

  const loader = ora({
    text: chalk.gray(`deploying contract on ${chalk.blue(networkName)}\n`),
    color: "blue",
    indent: 6,
  }).start();

  const deployed = await (await factory.deploy(...args)).deployed();

  if (shouldPrintVerifyInfo) {
    loader.stopAndPersist({
      symbol: chalk.blue("✓"),
      text: chalk.gray(
        `npx hardhat verify --network ${networkName} ${chalk.blue(deployed.address)} ${args.join(
          " "
        )}\n`
      ),
    });

    loader.indent = 0;
  } else {
    loader.indent = 0;
    loader.stop();
  }

  return deployed;
}

export * from "./nova";
