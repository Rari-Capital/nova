import { ethers } from "hardhat";
import { ContractTransaction } from "ethers";

export const wait = async (tx: Promise<ContractTransaction>) => {
  const transaction = await tx;
  const receipt = await transaction.wait();

  return { transaction, receipt };
};

export const createTestWallet = (
  rpc: string,
  key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
) => {
  return new ethers.Wallet(key, new ethers.providers.JsonRpcProvider(rpc));
};

export function createFactory<T>(name: string): Promise<T> {
  return ethers.getContractFactory(name) as any;
}
