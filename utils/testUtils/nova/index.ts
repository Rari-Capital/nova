import { ethers } from "hardhat";
import { BigNumber } from "ethers";

/** Computes the execHash for a request like NovaExecHashLib. */
export function computeExecHash({
  nonce,
  strategy,
  calldata,
  gasPrice,
  gasLimit,
}: {
  nonce: number;
  strategy: string;
  calldata: string;
  gasPrice: number | BigNumber;
  gasLimit: number;
}) {
  return ethers.utils.solidityKeccak256(
    ["uint256", "address", "bytes", "uint256", "uint256"],
    [nonce, strategy, calldata, gasPrice, gasLimit]
  );
}

export * from "./registry";
export * from "./executionManager";
