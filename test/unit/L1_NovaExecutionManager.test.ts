import { getFactory, snapshotGasCost } from "../../utils/testUtils";

import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  L2NovaRegistry__factory,
  L1NovaExecutionManager,
  L1NovaExecutionManager__factory,
  MockStrategy,
  MockCrossDomainMessenger,
  MockStrategy__factory,
  MockCrossDomainMessenger__factory,
  MockERC20,
  SimpleDSGuard,
  SimpleDSGuard__factory,
  MockERC20__factory,
  NoReturnValueERC20__factory,
  BadReturnValueERC20__factory,
  ReturnFalseERC20__factory,
} from "../../typechain";

describe("L1_NovaExecutionManager", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  let L1_NovaExecutionManager: L1NovaExecutionManager;
  let SimpleDSGuard: SimpleDSGuard;

  /// Mocks
  let MockERC20: MockERC20;
  let MockStrategy: MockStrategy;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockERC20 = await (
        await getFactory<MockERC20__factory>("MockERC20")
      ).deploy();

      MockStrategy = await (
        await getFactory<MockStrategy__factory>("MockStrategy")
      ).deploy();

      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>(
          "MockCrossDomainMessenger"
        )
      ).deploy();
    });

    it("should properly deploy the execution manager", async function () {
      L1_NovaExecutionManager = await (
        await getFactory<L1NovaExecutionManager__factory>(
          "L1_NovaExecutionManager"
        )
      ).deploy(ethers.constants.AddressZero, MockCrossDomainMessenger.address);
    });

    it("should properly use constructor arguments", async function () {
      // Make sure the constructor params were properly entered.
      await L1_NovaExecutionManager.messenger().should.eventually.equal(
        MockCrossDomainMessenger.address
      );
      await L1_NovaExecutionManager.L2_NovaRegistryAddress().should.eventually.equal(
        ethers.constants.AddressZero
      );
    });

    it("should contain constants that match expected values", async function () {
      // Make sure the hard revert text is correct.
      await L1_NovaExecutionManager.HARD_REVERT_TEXT().should.eventually.equal(
        "__NOVA__HARD__REVERT__"
      );

      // Make sure execCompletedMessageBytesLength is correct.
      await L1_NovaExecutionManager.execCompletedMessageBytesLength().should.eventually.equal(
        ((await (
          await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
        ).interface.encodeFunctionData("execCompleted", [
          ethers.utils.keccak256("0x00"),
          ethers.constants.AddressZero,
          0,
          false,
        ]).length) -
          2) /
          2
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
          L1_NovaExecutionManager.interface.getSighash(
            "execWithRecipient(uint72,address,bytes,address)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L1_NovaExecutionManager.interface.getSighash(
            "exec(uint72,address,bytes)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L1_NovaExecutionManager.interface.getSighash(
            "transferFromRelayer(address,uint256)"
          )
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

        await L1_NovaExecutionManager.owner().should.eventually.equal(
          deployer.address
        );
      });

      it("should allow connecting to the SimpleDSGuard", async function () {
        await L1_NovaExecutionManager.authority().should.eventually.equal(
          ethers.constants.AddressZero
        );

        await L1_NovaExecutionManager.setAuthority(SimpleDSGuard.address).should
          .not.be.reverted;

        await L1_NovaExecutionManager.authority().should.eventually.equal(
          SimpleDSGuard.address
        );
      });

      it("should allow setting the owner to null", async function () {
        await L1_NovaExecutionManager.setOwner(ethers.constants.AddressZero)
          .should.not.be.reverted;

        await L1_NovaExecutionManager.owner().should.eventually.equal(
          ethers.constants.AddressZero
        );
      });
    });
  });

  describe("hardRevert", function () {
    it("should revert with the proper message", async function () {
      await L1_NovaExecutionManager.hardRevert().should.be.revertedWith(
        await L1_NovaExecutionManager.HARD_REVERT_TEXT()
      );
    });
  });

  describe("exec/execWithRecipient", function () {
    it("should properly complete the first exec", async function () {
      await L1_NovaExecutionManager.exec(
        0,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData("thisFunctionWillNotRevert")
      ).should.not.be.reverted;
    });

    it("hard revert should cause exec to revert", async function () {
      await L1_NovaExecutionManager.exec(
        1,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData("thisFunctionWillHardRevert")
      ).should.be.revertedWith(
        await L1_NovaExecutionManager.HARD_REVERT_TEXT()
      );
    });

    it("soft revert should not exec to revert", async function () {
      await snapshotGasCost(
        L1_NovaExecutionManager.exec(
          2,
          MockStrategy.address,
          MockStrategy.interface.encodeFunctionData("thisFunctionWillRevert")
        )
      ).should.not.be.reverted;
    });

    it("should properly execute a minimal exec", async function () {
      await snapshotGasCost(
        L1_NovaExecutionManager.exec(
          2,
          MockStrategy.address,
          MockStrategy.interface.encodeFunctionData("thisFunctionWillNotRevert")
        )
      ).should.not.be.reverted;
    });

    it("should properly execute a stateful exec", async function () {
      await snapshotGasCost(
        L1_NovaExecutionManager.exec(
          3,
          MockStrategy.address,
          MockStrategy.interface.encodeFunctionData(
            "thisFunctionWillModifyState"
          )
        )
      ).should.not.be.reverted;

      await MockStrategy.counter().should.eventually.equal(2);
    });
  });

  describe("transferFromRelayer", function () {
    it("should transfer an arbitrary token to a strategy when requested", async function () {
      const [deployer] = signers;

      const weiAmount = ethers.utils.parseEther("1337");

      await MockERC20.approve(L1_NovaExecutionManager.address, weiAmount);

      await snapshotGasCost(
        L1_NovaExecutionManager.exec(
          4,
          MockStrategy.address,
          MockStrategy.interface.encodeFunctionData(
            "thisFunctionWillTransferFromRelayer",
            [MockERC20.address, weiAmount]
          )
        )
      )
        .should.emit(MockERC20, "Transfer")
        .withArgs(deployer.address, MockStrategy.address, weiAmount);

      await MockERC20.balanceOf(MockStrategy.address).should.eventually.equal(
        weiAmount
      );
    });

    it("will hard revert if tokens were not approved", async function () {
      await L1_NovaExecutionManager.exec(
        4,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData(
          "thisFunctionWillTransferFromRelayer",
          [MockERC20.address, ethers.utils.parseEther("9999999")]
        )
      ).should.be.revertedWith(
        await L1_NovaExecutionManager.HARD_REVERT_TEXT()
      );
    });

    it("will properly handle a transferFrom with no return value", async function () {
      const NoReturnValueERC20 = await (
        await getFactory<NoReturnValueERC20__factory>("NoReturnValueERC20")
      ).deploy();

      await L1_NovaExecutionManager.exec(
        5,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData(
          "thisFunctionWillTransferFromRelayer",
          [NoReturnValueERC20.address, 0]
        )
      ).should.not.be.reverted;
    });

    it("will hard revert if transferFrom returns a non-bool", async function () {
      const BadReturnValueERC20 = await (
        await getFactory<BadReturnValueERC20__factory>("BadReturnValueERC20")
      ).deploy();

      await L1_NovaExecutionManager.exec(
        6,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData(
          "thisFunctionWillTransferFromRelayer",
          [BadReturnValueERC20.address, 0]
        )
      ).should.be.revertedWith(
        await L1_NovaExecutionManager.HARD_REVERT_TEXT()
      );
    });

    it("will hard revert if transferFrom returns false without reverting", async function () {
      const ReturnFalseERC20 = await (
        await getFactory<ReturnFalseERC20__factory>("ReturnFalseERC20")
      ).deploy();

      await L1_NovaExecutionManager.exec(
        7,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData(
          "thisFunctionWillTransferFromRelayer",
          [ReturnFalseERC20.address, 0]
        )
      ).should.be.revertedWith(
        await L1_NovaExecutionManager.HARD_REVERT_TEXT()
      );
    });

    it("will not allow anyone to call if not executing", async function () {
      await L1_NovaExecutionManager.transferFromRelayer(
        MockERC20.address,
        0
      ).should.be.revertedWith("NOT_EXECUTING");
    });

    it("will not allow the prevous strategy to call if not executing", async function () {
      await MockStrategy.thisFunctionWillTryToTransferFromRelayerOnAnArbitraryExecutionManager(
        L1_NovaExecutionManager.address,
        MockERC20.address,
        1
      ).should.be.revertedWith("NOT_EXECUTING");
    });

    it("will not allow a random contract to call during execution", async function () {
      const [deployer] = signers;

      const preBalance = await MockERC20.balanceOf(deployer.address);

      const weiAmount = ethers.utils.parseEther("420");

      await MockERC20.approve(L1_NovaExecutionManager.address, weiAmount);

      await L1_NovaExecutionManager.exec(
        4,
        MockStrategy.address,
        MockStrategy.interface.encodeFunctionData(
          "thisFunctionWillEmulateAMaliciousExternalContractTryingToStealRelayerTokens",
          [MockERC20.address, weiAmount]
        )
      ).should.not.emit(MockERC20, "Transfer");

      // Balance should not change.
      await MockERC20.balanceOf(deployer.address).should.eventually.equal(
        preBalance
      );
    });
  });
});
