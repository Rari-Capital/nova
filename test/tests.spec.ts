import { ethers } from "hardhat";

import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { L2NovaRegistry__factory } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(chaiAsPromised);
chai.should();

describe("Nova", function () {
  let _accounts: SignerWithAddress[];

  before(async () => {
    _accounts = await ethers.getSigners();
  });

  it("requestExec", async function () {
    const [deployer] = _accounts;

    const L2NovaRegistry__factory = (await ethers.getContractFactory(
      "L2_NovaRegistry"
    )) as L2NovaRegistry__factory;

    const L2_NovaRegistry = await L2NovaRegistry__factory.deploy();

    const response = await (
      await L2_NovaRegistry.requestExec(
        deployer.address,
        "0x20",
        100,
        100,
        [],
        []
      )
    ).wait();
    console.log(response.gasUsed.toString());
  });
});
