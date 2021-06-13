import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import { ethers, network } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";

import chalk from "chalk";
import { L2NovaRegistry, MockCrossDomainMessenger } from "../typechain";

export function computeExecHash({
  nonce,
  strategy,
  calldata,
  gasPrice,
}: {
  nonce: number;
  strategy: string;
  calldata: string;
  gasPrice: number | BigNumber;
}) {
  return ethers.utils.solidityKeccak256(
    ["uint256", "address", "bytes", "uint256"],
    [nonce, strategy, calldata, gasPrice]
  );
}

export const createTestWallet = (
  rpc: string,
  key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
) => {
  return new ethers.Wallet(key, new ethers.providers.JsonRpcProvider(rpc));
};

export function getFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
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

export async function forceExecCompleted(
  fakeExecutionManagerAddress: string,
  mockCrossDomainMessenger: MockCrossDomainMessenger,
  L2_NovaRegistry: L2NovaRegistry,

  {
    execHash,
    rewardRecipient,
    reverted,
    gasUsed,
  }: {
    execHash: string;
    rewardRecipient: string;
    reverted: boolean;
    gasUsed: number;
  }
): Promise<ContractTransaction> {
  await mockCrossDomainMessenger.sendMessageWithSender(
    L2_NovaRegistry.address,
    L2_NovaRegistry.interface.encodeFunctionData("execCompleted", [
      execHash,
      rewardRecipient,
      reverted,
      gasUsed,
    ]),
    1_000_000,
    fakeExecutionManagerAddress
  );

  return mockCrossDomainMessenger.relayCurrentMessage();
}

export async function increaseTimeAndMine(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
