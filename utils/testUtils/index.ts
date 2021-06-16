import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import { ethers } from "hardhat";
import { ContractReceipt, ContractTransaction } from "ethers";

import chalk from "chalk";
import { IERC20 } from "../../typechain";
import { Interface } from "ethers/lib/utils";

/** Gets an ethers factory for a contract. T should be the typechain factory type of the contract (ie: MockERC20__factory). */
export function getFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
}

/** Increases EVM time by `seconds` and mines a new block. */
export async function increaseTimeAndMine(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/** Takes a contract interface and returns an array of all function sigHashes that are not pure/view.  */
export function getAllStatefulSigHashes(contractInterface: Interface) {
  return Object.entries(contractInterface.functions)
    .filter(([, fragment]) => {
      return !fragment.constant;
    })
    .map(([sig]) => contractInterface.getSighash(sig));
}

/** Records the gas usage of a transaction, and checks against the most recent saved Jest snapshot.
 * If not in CI mode it won't stop tests (just show a console log).
 * To update the Jest snapshot run `npm run gas-changed`
 */
export async function snapshotGasCost(x: Promise<ContractTransaction>) {
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

  return x;
}

/** Checkpoints `user`'s ether `token` balance upon calling.
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

export * from "./nova";
