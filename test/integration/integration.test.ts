import hre, { ethers } from "hardhat";
import { Watcher } from "@eth-optimism/watcher";
import { getContractFactory } from "@eth-optimism/contracts";

import {
  deployAndLogVerificationInfo,
  executeRequest,
  getOVMFactory,
  StrategyRiskLevel,
  waitForL1ToL2Relay,
} from "../../utils/testUtils";
import { tuneMissingGasEstimate } from "../../tasks/tune";

import {
  ERC20,
  L1NovaExecutionManager,
  L1NovaExecutionManager__factory,
  L2NovaRegistry,
  L2NovaRegistry__factory,
  MockAuthority__factory,
  MockStrategy,
  MockStrategy__factory,
} from "../../typechain";
import { gweiToWei } from "../../utils";
import { BigNumber } from "ethers";
import { HttpNetworkConfig } from "hardhat/types";

const isOptimisticKovan = hre.network.name === "optimisticKovan";

describe("Integration", function () {
  const watcher = new Watcher({
    l1: {
      provider: new ethers.providers.JsonRpcProvider(
        isOptimisticKovan
          ? (hre.config.networks.kovan as HttpNetworkConfig).url
          : "http://localhost:9545"
      ),
      messengerAddress: isOptimisticKovan
        ? "0x4361d0F75A0186C05f971c566dC6bEa5957483fD" // https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts/deployments/README.md
        : "0x59b670e9fA9D0A427751Af201D676719a970857b", // http://localhost:8080/addresses.json
    },
    l2: {
      provider: new ethers.providers.JsonRpcProvider((hre.network.config as HttpNetworkConfig).url),
      messengerAddress: "0x4200000000000000000000000000000000000007",
    },
  });

  // Wallets:
  const key = hre.network.config.accounts[0];
  const l1Wallet = new ethers.Wallet(key, watcher.l1.provider);
  const l2Wallet = new ethers.Wallet(key, watcher.l2.provider);

  // Nova Contracts:
  let L1_NovaExecutionManager: L1NovaExecutionManager;
  let L2_NovaRegistry: L2NovaRegistry;

  // OVM Contracts:
  let OVM_ETH: ERC20;

  // Strategies:
  let Strategy: MockStrategy;

  describe("setup", function () {
    it("should properly deploy the registry", async function () {
      OVM_ETH = getContractFactory("OVM_ETH")
        .connect(l2Wallet)
        .attach("0x4200000000000000000000000000000000000006");

      L2_NovaRegistry = await deployAndLogVerificationInfo(
        getOVMFactory<L2NovaRegistry__factory>("L2_NovaRegistry", true).connect(l2Wallet),
        OVM_ETH.address,
        watcher.l2.messengerAddress
      );
    });

    it("should properly deploy the execution manager", async function () {
      L1_NovaExecutionManager = await deployAndLogVerificationInfo(
        getOVMFactory<L1NovaExecutionManager__factory>("L1_NovaExecutionManager", false).connect(
          l1Wallet
        ),
        L2_NovaRegistry.address,
        watcher.l1.messengerAddress,
        1_500_000
      );
    });

    it("should properly link the registry to the execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(L1_NovaExecutionManager.address).should.not.be
        .reverted;
    });

    it("should allow changing the execution manager's authority", async function () {
      const MockAuthority = await deployAndLogVerificationInfo(
        getOVMFactory<MockAuthority__factory>("MockAuthority", false, "mocks/").connect(l1Wallet)
      );

      // Set the authority to a MockAuthority that always returns true.
      await L1_NovaExecutionManager.setAuthority(MockAuthority.address).should.not.be.reverted;
    });

    it("should properly deploy a strategy", async function () {
      Strategy = await deployAndLogVerificationInfo(
        getOVMFactory<MockStrategy__factory>("MockStrategy", false, "mocks/").connect(l1Wallet),
        L1_NovaExecutionManager.address,
        StrategyRiskLevel.SAFE
      );
    });

    it("should allow tuning the missing gas estimate", async function () {
      const { tx } = await executeRequest(L1_NovaExecutionManager.connect(l1Wallet), {
        relayer: l1Wallet.address,
        nonce: 420,
        strategy: Strategy.address,
        l1Calldata: Strategy.interface.encodeFunctionData("thisFunctionWillNotRevert"),

        // It will overestimate before tuning.
        expectedGasOverestimateAmount: 99999999999999,
      });

      await tuneMissingGasEstimate(L1_NovaExecutionManager, tx);
    });
  });

  describe("full request lifecycle", function () {
    const gasLimit = 300_000;
    const gasPrice = gweiToWei(50);
    const functionFragment = "thisFunctionWillNotRevert";

    it("should allow creating a simple request", async function () {
      await OVM_ETH.connect(l2Wallet).approve(
        L2_NovaRegistry.address,
        BigNumber.from(gasLimit).mul(gasPrice)
      ).should.not.be.reverted;

      await L2_NovaRegistry.connect(l2Wallet).requestExec(
        Strategy.address,
        Strategy.interface.encodeFunctionData(functionFragment),
        gasLimit,
        gasPrice,
        0,
        []
      ).should.not.be.reverted;
    });

    it("should allow executing the request", async function () {
      const { tx } = await executeRequest(L1_NovaExecutionManager.connect(l1Wallet), {
        relayer: l1Wallet.address,
        nonce: 1,
        strategy: Strategy.address,
        l1Calldata: Strategy.interface.encodeFunctionData(functionFragment),
        gasPrice,
      });

      await waitForL1ToL2Relay(tx, watcher);
    });
  });
});
