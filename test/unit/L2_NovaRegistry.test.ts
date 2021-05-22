import { getFactory, snapshotGasCost } from "../../utils/testUtils";

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

  const fakeExecutionManagerAddress =
    "0xDeADBEEF1337caFEBAbE1337CacAfACe1337C0dE";

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockETH = await (
        await getFactory<MockERC20__factory>("MockERC20")
      ).deploy();

      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>(
          "MockCrossDomainMessenger"
        )
      ).deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).deploy(MockETH.address, MockCrossDomainMessenger.address);
    });

    it("should allow connecting to an execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(
        fakeExecutionManagerAddress
      );

      await L2_NovaRegistry.L1_NovaExecutionManagerAddress().should.eventually.equal(
        fakeExecutionManagerAddress
      );
    });

    it("should properly use constructor arguments", async function () {
      // Make sure the constructor params were properly entered.
      await L2_NovaRegistry.messenger().should.eventually.equal(
        MockCrossDomainMessenger.address
      );

      await L2_NovaRegistry.ETH().should.eventually.equal(MockETH.address);
    });

    it("should contain constants that match expected values", async function () {
      // Make sure that the MIN_UNLOCK_DELAY_SECONDS is as expected.
      await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS().should.eventually.equal(
        300
      );
    });

    describe("simpleDSGuard", function () {
      it("should properly deploy a SimpleDSGuard", async function () {
        SimpleDSGuard = await (
          await getFactory<SimpleDSGuard__factory>("SimpleDSGuard")
        ).deploy();
      });

      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await SimpleDSGuard.owner().should.eventually.equal(deployer.address);
      });

      it("should properly permit authorization for specific functions", async function () {
        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "requestExec(address,bytes,uint64,uint256,uint256,(address,uint256)[])"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "requestExecWithTimeout(address,bytes,uint64,uint256,uint256,(address,uint256)[],uint256)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "speedUpRequest(bytes32,uint256)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("claimInputTokens(bytes32)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("unlockTokens(bytes32,uint256)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("relockTokens(bytes32)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("withdrawTokens(bytes32)")
        );
      });

      it("should allow setting the owner to null", async function () {
        await SimpleDSGuard.setOwner(ethers.constants.AddressZero).should.not.be
          .reverted;

        await SimpleDSGuard.owner().should.eventually.equal(
          ethers.constants.AddressZero
        );
      });
    });

    describe("dsAuth", function () {
      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await L2_NovaRegistry.owner().should.eventually.equal(deployer.address);
      });

      it("should allow connecting to the SimpleDSGuard", async function () {
        await L2_NovaRegistry.authority().should.eventually.equal(
          ethers.constants.AddressZero
        );

        await L2_NovaRegistry.setAuthority(SimpleDSGuard.address).should.not.be
          .reverted;

        await L2_NovaRegistry.authority().should.eventually.equal(
          SimpleDSGuard.address
        );
      });

      it("should allow setting the owner to null", async function () {
        await L2_NovaRegistry.setOwner(ethers.constants.AddressZero).should.not
          .be.reverted;

        await L2_NovaRegistry.owner().should.eventually.equal(
          ethers.constants.AddressZero
        );
      });
    });
  });
});
