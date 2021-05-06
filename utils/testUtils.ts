import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import { ethers, network } from "hardhat";
import { ContractTransaction } from "ethers";
import { Watcher } from "./watcher";
import { MockCrossDomainMessenger__factory } from "../typechain";
import chalk from "chalk";

export const wait = async (tx: Promise<ContractTransaction>) => {
  const transaction = await tx;
  const receipt = await transaction.wait();

  return { transaction, receipt };
};

export const createTestWallet = (
  rpc: string,
  key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
) => {
  return new ethers.Wallet(key, new ethers.providers.JsonRpcProvider(rpc));
};

export function createFactory<T>(
  isOVM: boolean,
  name: string,
  path?: string
): T {
  const artifact = require(`../artifacts${isOVM ? "-ovm" : ""}/contracts/${
    path ?? ""
  }${name}.sol/${name}.json`);
  return new ethers.ContractFactory(artifact.abi, artifact.bytecode) as any;
}

export async function waitForL1ToL2Tx(
  tx: Promise<ContractTransaction>,
  watcher: Watcher
): Promise<ContractTransaction> {
  const { transaction } = await wait(tx);

  if (network.ovm) {
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(transaction.hash);

    await watcher.getL2RelayTransaction(msgHash);
  } else {
    const MockCrossDomainMessenger = createFactory<MockCrossDomainMessenger__factory>(
      false,
      "MockCrossDomainMessenger",
      "mocks/"
    )
      .connect((await ethers.getSigners())[0])
      .attach(watcher.l1.messengerAddress);

    return MockCrossDomainMessenger.relayCurrentMessage();
  }
}

export async function snapshotGasCost(
  x: Promise<ContractTransaction>
): Promise<any> {
  if (!network.ovm) {
    const waited = await (await x).wait();

    try {
      waited.gasUsed.toNumber().should.toMatchSnapshot();

      console.log(
        chalk.yellow(
          "(NO CHANGE) Below is consuming " +
            waited.gasUsed.toString() +
            " gas. "
        )
      );
    } catch (e) {
      console.log(chalk.red("(CHANGE) " + e.message));

      if (process.env.CI) {
        return Promise.reject(
          new Error("reverted: Gas consumption changed from expected.")
        );
      } else {
        return x;
      }
    }
  }

  return x;
}
