import { BigNumber, BigNumberish } from "ethers";

import { computeExecHash, getFactory } from "..";
import { gweiToWei } from "../..";

import {
  L2NovaRegistry,
  MockCrossDomainMessenger,
  MockERC20,
  MockERC20__factory,
} from "../../../typechain";

export const MAX_UINT = BigNumber.from(2).pow(256).sub(1);

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
  L2_NovaRegistry: L2NovaRegistry,

  config: {
    calldata?: string;
    strategy?: string;
    gasLimit?: number;
    gasPrice?: number;
    tip?: number;
    value?: number;
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
  config.gasPrice = config.gasPrice ?? gweiToWei(15);
  config.tip = config.tip ?? 1e15; // 0.0001 ETH default tip
  config.inputTokens = config.inputTokens ?? [];

  const { gasLimit, calldata, strategy, gasPrice, tip, inputTokens } = config;

  // Approve ETH to pay for the gas and tip.
  let weiOwed = BigNumber.from(gasLimit).mul(gasPrice).add(tip);

  // Approve input tokens:
  const erc20Factory = await getFactory<MockERC20__factory>("MockERC20");
  for (const inputToken of inputTokens) {
    // Approve the max amount of each input token to the registry.
    erc20Factory.attach(inputToken.l2Token).approve(L2_NovaRegistry.address, MAX_UINT);
  }

  const tx = L2_NovaRegistry.requestExec(strategy, calldata, gasLimit, gasPrice, tip, inputTokens, {
    value: config.value ?? weiOwed,
  });

  await (await tx).wait();

  // Get the nonce associated with the request.
  const nonce = await (await L2_NovaRegistry.systemNonce()).toNumber();

  // Get the execHash associated with the request
  const execHash = computeExecHash({
    nonce,
    strategy,
    calldata,
    gasPrice,
    gasLimit,
  });

  return {
    tx,
    execHash,
    nonce,

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
  L2_NovaRegistry: L2NovaRegistry,

  config: {
    execHash: string;
    gasDelta?: number;
    value?: number;
  }
) {
  // Init default values if not provided.
  config.gasDelta = config.gasDelta ?? gweiToWei(10);

  const { execHash, gasDelta } = config;

  const gasLimit = (await L2_NovaRegistry.getRequestGasLimit(execHash)).toNumber();
  const gasPrice = (await L2_NovaRegistry.getRequestGasPrice(execHash)).toNumber();

  const newGasPrice = gasPrice + gasDelta;

  const tx = L2_NovaRegistry.speedUpRequest(execHash, gasPrice + gasDelta, {
    value: config.value ?? gasDelta * gasLimit,
  });
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
    gasLimit,
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
