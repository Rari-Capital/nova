import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";

import { getContractFactory } from "@eth-optimism/contracts";

import { Watcher } from "@eth-optimism/core-utils";
import { L2NovaRegistry__factory, L2NovaRegistry, IERC20 } from "../typechain";
import {
  createFactory,
  createTestWallet,
  wait,
  waitForL1ToL2Tx,
} from "../utils/testUtils";
import { ethers } from "hardhat";
import { L1NovaExecutionManager } from "../typechain/L1NovaExecutionManager";
import { L1NovaExecutionManager__factory } from "../typechain/factories/L1NovaExecutionManager__factory";

chai.use(chaiAsPromised);
chai.should();

describe("Nova", function () {
  const l1Wallet = createTestWallet("http://localhost:9545");
  const l2Wallet = createTestWallet("http://localhost:8545");

  // OVM contracts:
  // TODO: Use typechain defs once they're added to `@eth-optimism/contracts`
  const OVM_L1ETHGateway = getContractFactory("OVM_L1ETHGateway")
    .connect(l1Wallet)
    .attach("0x998abeb3e57409262ae5b751f60747921b33613e");

  const OVM_ETH = getContractFactory("OVM_ETH")
    .connect(l2Wallet)
    .attach("0x4200000000000000000000000000000000000006") as IERC20;

  // Cross layer watcher:
  const watcher = new Watcher({
    l1: {
      provider: l1Wallet.provider,
      messengerAddress: "0x59b670e9fA9D0A427751Af201D676719a970857b",
    },
    l2: {
      provider: l2Wallet.provider,
      messengerAddress: "0x4200000000000000000000000000000000000007",
    },
  });

  // Nova specific contracts:
  let l1_NovaExecutionManager: L1NovaExecutionManager;
  let l2_NovaRegistry: L2NovaRegistry;

  before(async () => {
    // Deposit ETH to our L2 wallet:
    await waitForL1ToL2Tx(
      OVM_L1ETHGateway.connect(l1Wallet).depositTo(l2Wallet.address, {
        value: ethers.utils.parseEther("5"),
      }),
      watcher
    );

    l1_NovaExecutionManager = await (
      await createFactory<L1NovaExecutionManager__factory>(
        "L1_NovaExecutionManager"
      )
    )
      .connect(l1Wallet)
      .deploy();

    l2_NovaRegistry = await (
      await createFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
    )
      .connect(l2Wallet)
      .deploy(l1_NovaExecutionManager.address, {
        gasLimit: 9000000,
        gasPrice: 0,
      });
  });

  it("requestExec", async function () {
    await wait(OVM_ETH.approve(l2_NovaRegistry.address, 100));

    const { receipt } = await wait(
      l2_NovaRegistry.requestExec(
        "0x0000000000000000000000000000000000000000",
        "0x20",
        10,
        10,
        [],
        []
      )
    );
  });
});
