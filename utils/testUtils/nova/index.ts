import { ethers } from "hardhat";
import { BigNumber } from "ethers";

/** Computes the execHash for a request like NovaExecHashLib. */
export function computeExecHash({
  nonce,
  strategy,
  calldata,
  gasPrice,
}: {
  nonce: number;
  strategy: string;
  calldata: string;
  gasPrice: number | BigNumber;
}) {
  return ethers.utils.solidityKeccak256(
    ["uint256", "address", "bytes", "uint256"],
    [nonce, strategy, calldata, gasPrice]
  );
}

export * from "./registry";
export * from "./executionManager";
