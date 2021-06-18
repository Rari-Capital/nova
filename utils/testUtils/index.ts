import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
chai.use(jestSnapshotPlugin());
chai.use(chaiAsPromised);
chai.should();

import { ethers } from "hardhat";
import { Contract, ContractReceipt, ContractTransaction } from "ethers";

import chalk from "chalk";
import { IERC20, DSRoles } from "../../typechain";
import { Interface } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/** Authorizes anyone to call any function on a contract via a DSRoles. */
export async function authorizeEveryFunction(DSRoles: DSRoles, contract: Contract) {
  const statefulFragments = getAllStatefulFragments(contract.interface);

  for (const fragment of statefulFragments) {
    await DSRoles.setPublicCapability(
      contract.address,
      contract.interface.getSighash(fragment),
      true
    );
  }
}

/** Calls all stateful functions in a contract to check if they revert with unauthorized.  */
export async function checkAllFunctionsForAuth(
  contract: Contract,
  account: SignerWithAddress,
  ignoreNames?: string[]
) {
  const statefulFragments = getAllStatefulFragments(contract.interface);

  for (const fragment of statefulFragments) {
    if (ignoreNames && ignoreNames.includes(fragment.name)) {
      continue;
    }

    const args = fragment.inputs.map((input) => {
      const baseType = input.baseType;

      if (baseType == "array") {
        return [];
      } else if (baseType === "address") {
        return "0xFEEDFACECAFEBEEFFEEDFACECAFEBEEFFEEDFACE";
      } else if (baseType === "bool") {
        return true;
      } else if (baseType.includes("bytes")) {
        if (baseType === "bytes") {
          return "0x00000000";
        }

        const numberOfBytes = parseInt(baseType.replace("bytes", ""));
        return ethers.utils.hexZeroPad("0x00000000", numberOfBytes);
      } else if (baseType === "uint256") {
        return 100000000000;
      } else if (baseType.includes("int")) {
        return 100;
      }
    });

    await contract
      .connect(account)
      [fragment.name](...args)
      .should.be.revertedWith("ds-auth-unauthorized");
  }
}

/** Returns an array of function fragments that are stateful from an interface. */
export function getAllStatefulFragments(contractInterface: Interface) {
  return Object.values(contractInterface.functions).filter((f) => !f.constant);
}

/** Gets an ethers factory for a contract. T should be the typechain factory type of the contract (ie: MockERC20__factory). */
export function getFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
}

/** Increases EVM time by `seconds` and mines a new block. */
export async function increaseTimeAndMine(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/** Records the gas usage of a transaction, and checks against the most recent saved Jest snapshot.
 * If not in CI mode it won't stop tests (just show a console log).
 * To update the Jest snapshot run `npm run gas-changed`
 */
export async function snapshotGasCost(x: Promise<ContractTransaction>) {
  let receipt: ContractReceipt = await (await x).wait();

  try {
    receipt.gasUsed.toNumber().should.toMatchSnapshot();
  } catch (e) {
    console.log(
      chalk.red(
        "(CHANGE) " +
          e.message
            .replace("expected", "used")
            .replace("to equal", "gas, but the snapshot expected it to use") +
          " gas"
      )
    );

    if (process.env.CI) {
      return Promise.reject("reverted: Gas consumption changed from expected.");
    }
  }

  return x;
}

/** Checkpoints `user`'s ether `token` balance upon calling.
 * Returns two functions (calcIncrease and calcDecrease,
 * calling calcIncrease will return the  `user`'s new `token`
 * balance minus the starting balance. Calling calcDecrease
 * subtracts the final balance from the balance.
 * */
export async function checkpointBalance(token: IERC20, user: string) {
  const startingBalance = await token.balanceOf(user);

  async function calcIncrease() {
    const finalBalance = await token.balanceOf(user);

    return finalBalance.sub(startingBalance);
  }

  async function calcDecrease() {
    const finalBalance = await token.balanceOf(user);

    return startingBalance.sub(finalBalance);
  }

  return [calcIncrease, calcDecrease];
}

export * from "./nova";
