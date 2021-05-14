import { createFactory, snapshotGasCost } from "../../utils/testUtils";

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
  DSGuard,
  DSGuard__factory,
  MockERC20__factory,
} from "../../typechain";

describe("L1_NovaExecutionManager", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  let L1_NovaExecutionManager: L1NovaExecutionManager;
  let DSGuard: DSGuard;

  /// Mocks
  let MockERC20: MockERC20;
  let MockStrategy: MockStrategy;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      const [deployer] = signers;

      MockERC20 = await createFactory<MockERC20__factory>(
        false,
        "MockERC20",
        "mocks/"
      )
        .connect(deployer)
        .deploy();

      MockStrategy = await createFactory<MockStrategy__factory>(
        false,
        "MockStrategy",
        "mocks/"
      )
        .connect(deployer)
        .deploy();

      MockCrossDomainMessenger =
        await createFactory<MockCrossDomainMessenger__factory>(
          false,
          "MockCrossDomainMessenger",
          "mocks/"
        )
          .connect(deployer)
          .deploy();
    });

    it("should properly deploy the execution manager", async function () {
      const [deployer] = signers;

      L1_NovaExecutionManager =
        await createFactory<L1NovaExecutionManager__factory>(
          false,
          "L1_NovaExecutionManager"
        )
          .connect(deployer)
          .deploy(
            ethers.constants.AddressZero,
            MockCrossDomainMessenger.address
          );
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
        ((await createFactory<L2NovaRegistry__factory>(
          false,
          "L2_NovaRegistry"
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

    describe("dsGuard", function () {
      it("should properly deploy a DSGuard", async function () {
        const [deployer] = signers;

        DSGuard = await createFactory<DSGuard__factory>(
          false,
          "DSGuard",
          "external/"
        )
          .connect(deployer)
          .deploy();
      });

      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await DSGuard.owner().should.eventually.equal(deployer.address);
      });

      it("should allow setting the authorization of all functions to ANY", async function () {
        await DSGuard.permitBytes(
          await DSGuard.ANY(),
          await DSGuard.ANY(),
          await DSGuard.ANY()
        ).should.not.be.reverted;

        await DSGuard.canCall(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          L1_NovaExecutionManager.interface.getSighash(
            L1_NovaExecutionManager.interface.functions[
              "exec(uint72,address,bytes)"
            ]
          )
        ).should.eventually.equal(true);
      });

      it("should allow setting the owner to null", async function () {
        await DSGuard.setOwner(ethers.constants.AddressZero).should.not.be
          .reverted;

        await DSGuard.owner().should.eventually.equal(
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

      it("should allow connecting to a DSGuard", async function () {
        await L1_NovaExecutionManager.authority().should.eventually.equal(
          ethers.constants.AddressZero
        );

        await L1_NovaExecutionManager.setAuthority(DSGuard.address).should.not
          .be.reverted;
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
      ).should.be.revertedWith("HARD_REVERT");
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
  });
});
