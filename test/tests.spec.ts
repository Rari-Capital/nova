import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { getContractFactory } from "@eth-optimism/contracts";

import { Watcher } from "@eth-optimism/core-utils";
import { L2NovaRegistry__factory, L2NovaRegistry } from "../typechain";
import { createFactory, createTestWallet, wait } from "../utils/testUtils";

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
    .attach("0x4200000000000000000000000000000000000006");

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
  let l2_novaRegistry: L2NovaRegistry;
  before(async () => {
    l2_novaRegistry = await (
      await createFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
    ).deploy("0x0000000000000000000000000000000000000000", l2Wallet.address);
  });

  it("requestExec", async function () {
    console.log("Depositing ETH...");
    const { transaction } = await wait(
      OVM_L1ETHGateway.connect(l1Wallet).deposit({
        value: "1000",
      })
    );

    console.log(
      "ETH balance:",
      (await OVM_ETH.balanceOf(l1Wallet.address)).toString()
    );

    console.log("Getting message hash...");
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(transaction.hash);
    console.log("Getting l2 transaction receipt...");
    await watcher.getL2TransactionReceipt(msgHash);

    console.log(
      "New ETH balance:",
      (await OVM_ETH.balanceOf(l1Wallet.address)).toString()
    );

    // const response = await (
    //   await l2_novaRegistry.requestExec(
    //     "0x0000000000000000000000000000000000000000",
    //     "0x20",
    //     100,
    //     100,
    //     [],
    //     []
    //   )
    // ).wait();

    // console.log(response.gasUsed.toString());
  });
});
