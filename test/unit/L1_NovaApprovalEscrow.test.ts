import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { getFactory, snapshotGasCost } from "../../utils/testUtils";

import {
  MockERC20,
  MockERC20__factory,
  L1NovaApprovalEscrow,
  L1NovaApprovalEscrow__factory,
} from "../../typechain";

describe("L1_NovaApprovalEscrow", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  /// Mocks:
  let MockERC20: MockERC20;
  let MockRecipientAddress: string = "0xfEEDFaCEcaFeBEEFfEEDFACecaFEBeeFfeEdfAce";

  // Nova Contracts:
  let L1_NovaApprovalEscrow: L1NovaApprovalEscrow;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockERC20 = await (await getFactory<MockERC20__factory>("MockERC20")).deploy();
    });

    it("should properly deploy the execution escrow", async function () {
      L1_NovaApprovalEscrow = await (
        await getFactory<L1NovaApprovalEscrow__factory>("L1_NovaApprovalEscrow")
      ).deploy();
    });

    it("should contain constants that match expected values", async function () {
      const [deployer] = signers;

      await L1_NovaApprovalEscrow.ESCROW_ADMIN().should.eventually.equal(deployer.address);
    });
  });

  describe("transferApprovedToken", function () {
    it("should transfer an arbitrary token to an arbitrary destination", async function () {
      const [admin] = signers;

      // Approve some tokens to the escrow.
      const weiAmount = ethers.utils.parseEther("1337");
      await MockERC20.approve(L1_NovaApprovalEscrow.address, weiAmount);

      await snapshotGasCost(
        L1_NovaApprovalEscrow.transferApprovedToken(
          MockERC20.address,
          weiAmount,
          admin.address,
          MockRecipientAddress
        )
      )
        // The correct amount of tokens should be transferred to the recipient.
        .should.emit(MockERC20, "Transfer")
        .withArgs(admin.address, MockRecipientAddress, weiAmount);

      await MockERC20.balanceOf(MockRecipientAddress).should.eventually.equal(weiAmount);
    });

    it("does not allow calling if not admin", async function () {
      const [, nonAdmin] = signers;

      await L1_NovaApprovalEscrow.connect(nonAdmin)
        .transferApprovedToken(
          ethers.constants.AddressZero,
          0,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        )
        .should.be.revertedWith("UNAUTHORIZED");
    });
  });
});
