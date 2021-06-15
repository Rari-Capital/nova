import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import { ethers, network } from "hardhat";
import { ContractReceipt, ContractTransaction } from "ethers";

import chalk from "chalk";
import { IERC20 } from "../../typechain";

export function getFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
}

export async function increaseTimeAndMine(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

export async function snapshotGasCost(
  x: Promise<ContractTransaction>
): Promise<ContractTransaction> {
  if (!network.ovm) {
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
        return Promise.reject(
          "reverted: Gas consumption changed from expected."
        );
      }
    }
  }

  return x;
}

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

export * from "./nova";
