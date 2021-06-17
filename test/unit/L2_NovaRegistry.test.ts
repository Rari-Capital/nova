import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  L2NovaRegistry__factory,
  MockCrossDomainMessenger,
  MockCrossDomainMessenger__factory,
  MockERC20,
  SimpleDSGuard,
  SimpleDSGuard__factory,
  MockERC20__factory,
  L2NovaRegistry,
} from "../../typechain";

import {
  getFactory,
  snapshotGasCost,
  fakeExecutionManagerAddress,
  checkpointBalance,
  createRequest,
  assertInputTokensMatch,
  authorizeEveryFunction,
  checkAllFunctionsForAuth,
} from "../../utils/testUtils";

describe("L2_NovaRegistry", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  let L2_NovaRegistry: L2NovaRegistry;
  let SimpleDSGuard: SimpleDSGuard;

  /// Mocks
  let MockETH: MockERC20;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockETH = await (await getFactory<MockERC20__factory>("MockERC20")).deploy();

      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>("MockCrossDomainMessenger")
      ).deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).deploy(MockETH.address, MockCrossDomainMessenger.address);
    });

    it("should properly use constructor arguments", async function () {
      // Make sure the constructor params were properly entered.
      await L2_NovaRegistry.messenger().should.eventually.equal(MockCrossDomainMessenger.address);

      await L2_NovaRegistry.ETH().should.eventually.equal(MockETH.address);
    });

    it("should allow connecting to an execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(fakeExecutionManagerAddress);

      await L2_NovaRegistry.L1_NovaExecutionManagerAddress().should.eventually.equal(
        fakeExecutionManagerAddress
      );
    });

    describe("simpleDSGuard", function () {
      it("should properly deploy a SimpleDSGuard", async function () {
        SimpleDSGuard = await (await getFactory<SimpleDSGuard__factory>("SimpleDSGuard")).deploy();
      });

      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await SimpleDSGuard.owner().should.eventually.equal(deployer.address);
      });

      it("should not allow calling stateful functions before permitted", async function () {
        const [, nonDeployer] = signers;

        await checkAllFunctionsForAuth(L2_NovaRegistry, nonDeployer);
      });

      it("should properly permit authorization for specific functions", async function () {
        await authorizeEveryFunction(SimpleDSGuard, L2_NovaRegistry);
      });

      it("should allow setting the owner to null", async function () {
        await SimpleDSGuard.setOwner(ethers.constants.AddressZero).should.not.be.reverted;

        await SimpleDSGuard.owner().should.eventually.equal(ethers.constants.AddressZero);
      });
    });

    describe("dsAuth", function () {
      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await L2_NovaRegistry.owner().should.eventually.equal(deployer.address);
      });

      it("should allow connecting to the SimpleDSGuard", async function () {
        await L2_NovaRegistry.authority().should.eventually.equal(ethers.constants.AddressZero);

        await L2_NovaRegistry.setAuthority(SimpleDSGuard.address).should.not.be.reverted;

        await L2_NovaRegistry.authority().should.eventually.equal(SimpleDSGuard.address);
      });

      it("should allow setting the owner to null", async function () {
        await L2_NovaRegistry.setOwner(ethers.constants.AddressZero).should.not.be.reverted;

        await L2_NovaRegistry.owner().should.eventually.equal(ethers.constants.AddressZero);
      });
    });
  });

  describe("requestExec", function () {
    it("allows making a simple request", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {});

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that there are no input tokens attached.
      await L2_NovaRegistry.getRequestInputTokens(execHash).should.eventually.have.lengthOf(0);
    });

    it("allows making a simple request with one input token", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, inputTokens, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockETH.address, amount: 5 }],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("allows a simple request with 2 input tokens", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, inputTokens, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("does not allow making a request with >5 input tokens", async function () {
      await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1 },
          { l2Token: MockETH.address, amount: 2 },
          { l2Token: MockETH.address, amount: 3 },
          { l2Token: MockETH.address, amount: 4 },
          { l2Token: MockETH.address, amount: 5 },
          { l2Token: MockETH.address, amount: 6 },
        ],
      }).should.be.revertedWith("TOO_MANY_INPUTS");
    });
  });
});
