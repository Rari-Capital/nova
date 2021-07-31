import { BigNumber, BigNumberish } from "ethers";

import { computeExecHash } from ".";
import { getFactory } from "..";
import { gweiToWei } from "../..";

import {
  L2NovaRegistry,
  MockCrossDomainMessenger,
  MockERC20,
  MockERC20__factory,
} from "../../../typechain";

export const fakeStrategyAddress = "0x4200000000000000000000000000000000000069";
export const fakeExecutionManagerAddress = "0xDeADBEEF1337caFEBAbE1337CacAfACe1337C0dE";

/**
 * Checks that locally generated input tokens array matches one returned from ethers
 * Difficult to compare BNs in an array like this to numbers which is why you need this function.
 */
export function assertInputTokensMatch(
  inputTokens: {
    l2Token: string;
    amount: BigNumberish;
  }[],
  requestInputTokens: {
    l2Token: string;
    amount: BigNumber;
  }[]
) {
  inputTokens.length.should.equal(requestInputTokens.length);

  for (let i = 0; i < inputTokens.length; i++) {
    const inputToken = inputTokens[i];
    const requestInputToken = requestInputTokens[i];

    inputToken.amount.toString().should.equal(requestInputToken.amount.toString());

    inputToken.l2Token.should.equal(requestInputToken.l2Token);
  }
}

/**
 * Small helper function to create a request and return its execHash.
 * Will revert if creating the request reverts.
 */
export async function createRequest(
  MockETH: MockERC20,
  L2_NovaRegistry: L2NovaRegistry,

  config: {
    calldata?: string;
    strategy?: string;
    gasLimit?: number;
    gasPrice?: number;
    tip?: number;
    inputTokens?: {
      l2Token: string;
      amount: number;
    }[];
  }
) {
  // Init default values if not provided.
  config.calldata = config.calldata ?? "0x00";
  config.strategy = config.strategy ?? fakeStrategyAddress;
  config.gasLimit = config.gasLimit ?? 500_000;
  config.gasPrice = config.gasLimit ?? gweiToWei(15);
  config.gasPrice = config.gasLimit ?? gweiToWei(15);
  config.tip = config.tip ?? 1e15; // 0.0001 ETH default tip
  config.inputTokens = config.inputTokens ?? [];

  const { gasLimit, calldata, strategy, gasPrice, tip, inputTokens } = config;

  // Approve ETH to pay for the gas and tip.
  let weiOwed = gasLimit * gasPrice + tip;
  await MockETH.approve(L2_NovaRegistry.address, weiOwed);
  config;
  // Approve and store input tokens if necessary.
  let inputTokenERC20s: MockERC20[] = [];
  if (inputTokens.length > 0) {
    // Get a factory to link to input token ERC20.
    const erc20Factory = await getFactory<MockERC20__factory>("MockERC20");

    for (const inputToken of inputTokens) {
      const inputTokenERC20 = erc20Factory.attach(inputToken.l2Token);

      if (inputTokenERC20.address === MockETH.address) {
        // Add the amount to the existing approval.
        weiOwed += inputToken.amount;
        inputTokenERC20.approve(L2_NovaRegistry.address, weiOwed);
      } else {
        // Approve the input token to the registry.
        await inputTokenERC20.approve(L2_NovaRegistry.address, inputToken.amount);
      }

      inputTokenERC20s.push(inputTokenERC20);
    }
  }

  const tx = L2_NovaRegistry.requestExec(strategy, calldata, gasLimit, gasPrice, tip, inputTokens);
  await tx;

  // Get the nonce associated with the request.
  const nonce = await (await L2_NovaRegistry.systemNonce()).toNumber();

  // Get the execHash associated with the request
  const execHash = computeExecHash({
    nonce,
    strategy,
    calldata,
    gasPrice,
  });

  return {
    tx,
    execHash,
    nonce,
    inputTokenERC20s,
    weiOwed,
    ...config,
  };
}

/**
 * Small helper function to speed up a request
 * and return the sped up request's execHash.
 * Will revert if speedUpRequest reverts.
 */
export async function speedUpRequest(
  MockETH: MockERC20,
  L2_NovaRegistry: L2NovaRegistry,

  config: {
    execHash: string;
    gasPrice: number;
    gasLimit: number;
    gasDelta?: number;
  }
) {
  // Init default values if not provided.
  config.gasDelta = config.gasDelta ?? gweiToWei(10);

  const { execHash, gasPrice, gasLimit, gasDelta } = config;

  const newGasPrice = gasPrice + gasDelta;

  // Approve extra ETH for gas.
  await MockETH.approve(L2_NovaRegistry.address, gasDelta * gasLimit);

  const tx = L2_NovaRegistry.speedUpRequest(execHash, gasPrice + gasDelta);
  await tx;

  // Get data associated with the uncled request.
  const uncleStrategy = await L2_NovaRegistry.getRequestStrategy(execHash);
  const uncleCalldata = await L2_NovaRegistry.getRequestCalldata(execHash);

  // Get the nonce associated with the resubmitted request.
  const resubmittedNonce = await (await L2_NovaRegistry.systemNonce()).toNumber();

  // Get the execHash associated with the request
  const resubmittedExecHash = computeExecHash({
    nonce: resubmittedNonce,
    strategy: uncleStrategy,
    calldata: uncleCalldata,
    gasPrice: gasPrice + gasDelta,
  });

  return { tx, resubmittedExecHash, uncleExecHash: execHash, newGasPrice, ...config };
}

/**
 * Small helper function to simplify calling execCompleted
 * as though you were the execution manager.
 * Will revert if execCompleted reverts.
 */
export async function completeRequest(
  MockCrossDomainMessenger: MockCrossDomainMessenger,
  L2_NovaRegistry: L2NovaRegistry,

  config: {
    execHash: string;
    rewardRecipient: string;
    reverted: boolean;
    gasUsed: number;
    sender?: string;
  }
) {
  const { execHash, rewardRecipient, reverted, gasUsed } = config;

  const tx = MockCrossDomainMessenger.relayMessage(
    L2_NovaRegistry.address,
    L2_NovaRegistry.interface.encodeFunctionData("execCompleted", [
      execHash,
      rewardRecipient,
      reverted,
      gasUsed,
    ]),
    config.sender ?? fakeExecutionManagerAddress
  );
  await tx;

  return { tx, ...config };
}
