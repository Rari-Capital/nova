import { ethers } from "hardhat";
import { Watcher } from "@eth-optimism/watcher";
import { getContractFactory } from "@eth-optimism/contracts";
import { createLocalProvider, getOVMFactory } from "../../utils/testUtils";
import {
  ERC20,
  L1NovaExecutionManager,
  L1NovaExecutionManager__factory,
  L2NovaRegistry,
  L2NovaRegistry__factory,
  MockStrategy,
  MockStrategy__factory,
} from "../../typechain";
import { gweiToWei } from "../../utils";
import { BigNumber } from "ethers";

describe("Integration", function () {
  const watcher = new Watcher({
    l1: {
      provider: createLocalProvider(9545),
      messengerAddress: "0x59b670e9fA9D0A427751Af201D676719a970857b",
    },
    l2: {
      provider: createLocalProvider(8545),
      messengerAddress: "0x4200000000000000000000000000000000000007",
    },
  });

  const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const l1Wallet = new ethers.Wallet(key, watcher.l1.provider);
  const l2Wallet = new ethers.Wallet(key, watcher.l2.provider);

  // Nova specific contracts:
  let L1_NovaExecutionManager: L1NovaExecutionManager;
  let L2_NovaRegistry: L2NovaRegistry;

  // OVM contracts:
  let OVM_ETH: ERC20;

  // Mock contracts:
  let MockStrategy: MockStrategy;

  describe("setup", function () {
    it("should properly deploy mocks", async function () {
      OVM_ETH = getContractFactory("OVM_ETH")
        .connect(l2Wallet)
        .attach("0x4200000000000000000000000000000000000006");

      MockStrategy = await getOVMFactory<MockStrategy__factory>("MockStrategy", false, "mocks/")
        .connect(l1Wallet)
        .deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await getOVMFactory<L2NovaRegistry__factory>("L2_NovaRegistry", true)
        .connect(l2Wallet)
        .deploy(OVM_ETH.address, watcher.l2.messengerAddress);
    });

    it("should properly deploy the execution manager", async function () {
      L1_NovaExecutionManager = await getOVMFactory<L1NovaExecutionManager__factory>(
        "L1_NovaExecutionManager",
        false
      )
        .connect(l1Wallet)
        .deploy(L2_NovaRegistry.address, watcher.l1.messengerAddress);
    });

    it("should properly link the registry to the execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(L1_NovaExecutionManager.address).should.not.be
        .reverted;
    });
  });

  describe("full request lifecycle", function () {
    it("should allow creating a simple request", async function () {
      await OVM_ETH.connect(l2Wallet).approve(
        L2_NovaRegistry.address,
        BigNumber.from(300_000).mul(gweiToWei(40))
      ).should.not.be.reverted;

      await L2_NovaRegistry.connect(l2Wallet).requestExec(
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData("thisFunctionWillNotRevert"),
        300_000,
        gweiToWei(40),
        0,
        []
      ).should.not.be.reverted;
    });

    it("should allow executing the request", async function () {
      await L1_NovaExecutionManager.connect(l1Wallet).exec(
        0,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData("thisFunctionWillNotRevert"),
        l2Wallet.address,
        99999999999,
        { gasPrice: gweiToWei(40) }
      ).should.not.be.reverted;
    });
  });
});
