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
} from "../../typechain";

describe("L1_NovaExecutionManager", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  /// Mocks
  let MockStrategy: MockStrategy;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  let L1_NovaExecutionManager: L1NovaExecutionManager;

  it("should properly deploy contracts", async function () {
    const [deployer] = signers;

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

    L1_NovaExecutionManager =
      await createFactory<L1NovaExecutionManager__factory>(
        false,
        "L1_NovaExecutionManager"
      )
        .connect(deployer)
        .deploy(ethers.constants.AddressZero, MockCrossDomainMessenger.address);
  });

  it("should properly init constructor params", async function () {
    // Make sure the constructor params were properly entered.
    await L1_NovaExecutionManager.messenger().should.eventually.equal(
      MockCrossDomainMessenger.address
    );
    await L1_NovaExecutionManager.L2_NovaRegistryAddress().should.eventually.equal(
      ethers.constants.AddressZero
    );
  });

  it("should properly init constants", async function () {
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
});
