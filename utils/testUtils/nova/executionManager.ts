import { BytesLike, ContractTransaction } from "ethers";
import { computeExecHash } from ".";
import chalk from "chalk";

import { L1NovaExecutionManager } from "../../../typechain";
import ora from "ora";

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
  config.l2Recipient = config.l2Recipient ?? config.relayer;
  config.deadline = config.deadline ?? 9999999999999;
  config.shouldSoftRevert = config.shouldSoftRevert ?? false;
  config.expectedGasOverestimateAmount = config.expectedGasOverestimateAmount ?? 0;
  config.gasPrice = config.gasPrice ?? 15;

  const {
    nonce,
    strategy,
    l1Calldata,
    l2Recipient,
    deadline,
    shouldSoftRevert,
    expectedGasOverestimateAmount,
    relayer,
    gasPrice,
  } = config;

  const tx = L1_NovaExecutionManager.exec(nonce, strategy, l1Calldata, l2Recipient, deadline, {
    gasPrice,
  });
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

/**
 * Finds the optimal missing gas estimate for an execution manager based on a single exec tx.
 */
async function findOptimalMissingGasEstimate(
  L1_NovaExecutionManager: L1NovaExecutionManager,
  tx: Promise<ContractTransaction>
) {
  const { gasUsed, events, blockNumber } = await (await tx).wait();
  const execEvent = events[events.length - 1];

  const previousMissingGasEstimate = (
    await L1_NovaExecutionManager.missingGasEstimate({ blockTag: blockNumber })
  ).toNumber();

  const underestimateAmount = gasUsed.toNumber() - execEvent.args.gasUsed.toNumber();

  return {
    underestimateAmount,
    previousMissingGasEstimate,
    optimalMissingGasEstimate: previousMissingGasEstimate + underestimateAmount,
  };
}

/**
 * Tunes an execution manager's missing gas estimate based on single exec tx.
 */
export async function tuneMissingGasEstimate(
  L1_NovaExecutionManager: L1NovaExecutionManager,
  tx: Promise<ContractTransaction>
) {
  const { previousMissingGasEstimate, optimalMissingGasEstimate } =
    await findOptimalMissingGasEstimate(L1_NovaExecutionManager, tx);

  const loader = ora({
    text: chalk.gray(
      `tuning missing gas estimate from ${chalk.green(
        previousMissingGasEstimate.toString()
      )} to ${chalk.green(optimalMissingGasEstimate.toString())}\n`
    ),
    color: "green",
    indent: 6,
  }).start();

  await (
    await L1_NovaExecutionManager.setMissingGasEstimate(
      // Update the gas estimate based on the delta (lower it if its over, increase it if its under) and give it 500 gas of leeway.
      optimalMissingGasEstimate + 500
    )
  ).wait();

  loader.indent = 0;
  loader.stop();
}
