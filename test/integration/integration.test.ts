import hre, { ethers } from "hardhat";
import { Watcher } from "@eth-optimism/core-utils";
import { HttpNetworkConfig } from "hardhat/types";

import {
  createRequest,
  deployAndLogVerificationInfo,
  executeRequest,
  getOVMFactory,
  StrategyRiskLevel,
  wait,
  waitForL1ToL2Relay,
} from "../../utils/testUtils";
import { gweiToWei } from "../../utils";
import { tuneMissingGasEstimate } from "../../tasks/tune";

import {
  L1NovaExecutionManager,
  L1NovaExecutionManager__factory,
  L2NovaRegistry,
  L2NovaRegistry__factory,
  MockAuthority__factory,
  MockStrategy,
  MockStrategy__factory,
} from "../../typechain";

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

  // Strategies:
  let Strategy: MockStrategy;

  describe("setup", function () {
    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await deployAndLogVerificationInfo(
        getOVMFactory<L2NovaRegistry__factory>("L2_NovaRegistry", true).connect(l2Wallet),
        watcher.l2.messengerAddress
      );
    });

    it("should properly deploy the execution manager", async function () {
      L1_NovaExecutionManager = await deployAndLogVerificationInfo(
        getOVMFactory<L1NovaExecutionManager__factory>("L1_NovaExecutionManager", false).connect(
          l1Wallet
        ),
        L2_NovaRegistry.address,
        watcher.l1.messengerAddress
      );
    });

    it("should properly link the registry to the execution manager", async function () {
      await wait(L2_NovaRegistry.connectExecutionManager(L1_NovaExecutionManager.address));
    });

    it("should allow changing the execution manager's authority", async function () {
      const MockAuthority = await deployAndLogVerificationInfo(
        getOVMFactory<MockAuthority__factory>("MockAuthority", false, "mocks/").connect(l1Wallet)
      );

      // Set the authority to a MockAuthority that always returns true.
      await wait(L1_NovaExecutionManager.setAuthority(MockAuthority.address));
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
      await createRequest(L2_NovaRegistry, {
        strategy: Strategy.address,
        calldata: Strategy.interface.encodeFunctionData(functionFragment),
        gasLimit,
        gasPrice,
        tip: 0,
      });
    });

    it("should allow executing the request", async function () {
      const { tx } = await executeRequest(L1_NovaExecutionManager.connect(l1Wallet), {
        nonce: 1,
        relayer: l1Wallet.address,
        strategy: Strategy.address,
        l1Calldata: Strategy.interface.encodeFunctionData(functionFragment),
        gasLimit,
        gasPrice,
      });

      await waitForL1ToL2Relay(tx, watcher);
    });
  });
});
