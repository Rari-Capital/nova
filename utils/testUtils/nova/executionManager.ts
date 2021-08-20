import { BytesLike } from "ethers";

import { computeExecHash } from ".";
import { getFactory } from "..";

import { L1NovaExecutionManager, MockStrategy__factory } from "../../../typechain";

/**
 * We use this global counter to
 * generate unique (but deterministic values)
 * for nonce in executeRequest.
 */
let globalNonce: number = 1;

/**
 * Checks an exec tx emitted events with reasonable values.
 * Will revert if execCompleted reverts.
 */
export async function executeRequest(
  L1_NovaExecutionManager: L1NovaExecutionManager,

  config: {
    nonce?: number;
    strategy: string;
    l1Calldata?: BytesLike;
    gasLimit?: number;
    l2Recipient?: string;
    deadline?: number;
    shouldSoftRevert?: boolean;
    relayer: string;
    gasPrice?: number;
    expectedGasOverestimateAmount?: number;
  }
) {
  // Init default values if not provided.
  config.nonce = config.nonce ?? globalNonce++;
  config.l1Calldata = config.l1Calldata ?? "0x00";
  config.gasLimit = config.gasLimit ?? 300_000;
  config.l2Recipient = config.l2Recipient ?? config.relayer;
  config.deadline = config.deadline ?? 9999999999999;
  config.shouldSoftRevert = config.shouldSoftRevert ?? false;
  config.expectedGasOverestimateAmount = config.expectedGasOverestimateAmount ?? 0;

  const {
    nonce,
    strategy,
    l1Calldata,
    gasLimit,
    l2Recipient,
    deadline,
    shouldSoftRevert,
    expectedGasOverestimateAmount,
    relayer,
    gasPrice,
  } = config;

  const tx = L1_NovaExecutionManager.exec(
    nonce,
    strategy,
    l1Calldata,
    gasLimit,
    l2Recipient,
    deadline,
    { type: 0, gasPrice }
  );
  const awaitedTx = await tx;

  // Get events and gas used from the tx.
  const { gasUsed, events } = await awaitedTx.wait();
  const execEvent = events[events.length - 1];

  // Compute the execHash for the execution.
  const execHash = computeExecHash({
    nonce,
    strategy,
    calldata: l1Calldata.toString(),
    gasPrice: awaitedTx.gasPrice.toNumber(),
    gasLimit,
  });

  // Did it properly compute the request's execHash.
  execEvent.args.execHash.should.equal(execHash);

  // Was the relayer emitted as expected.
  execEvent.args.relayer.should.equal(relayer);

  // Did the request soft revert like intended (or not).
  execEvent.args.reverted.should.equal(shouldSoftRevert);

  // Only check gas estimates if we're not in coverage mode, as gas estimates are messed up in coverage mode.
  if (!process.env.HARDHAT_COVERAGE_MODE_ENABLED) {
    // The gasUsed estimate in the event should always be more than the actual gas used, but should never be more than 16,000 gas above.
    const overestimateAmount = execEvent.args.gasUsed.toNumber() - gasUsed.toNumber();
    overestimateAmount.should.be.within(0, 1000 + expectedGasOverestimateAmount);
  }

  return { tx, execHash, gasUsed, execEvent, ...config };
}

export enum StrategyRiskLevel {
  UNKNOWN,
  SAFE,
  UNSAFE,
}

export async function deployStrategy(
  executionManager: L1NovaExecutionManager,
  riskLevel?: StrategyRiskLevel
) {
  return await (
    await getFactory<MockStrategy__factory>("MockStrategy")
  ).deploy(executionManager.address, riskLevel ?? StrategyRiskLevel.UNKNOWN);
}
