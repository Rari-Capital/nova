import { BytesLike } from "ethers";
import { ethers } from "hardhat";
import { computeExecHash } from ".";
import { L1NovaExecutionManager } from "../../../typechain";

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
    ignoreGasUsedCheck?: boolean;
  }
) {
  const caller = (await ethers.getSigners())[0].address;

  // Init default values if not provided.
  config.nonce = config.nonce ?? 123456;
  config.l1Calldata = config.l1Calldata ?? "0x00";
  config.l2Recipient = config.l2Recipient ?? caller;
  config.deadline = config.deadline ?? 9999999999999;
  config.shouldSoftRevert = config.shouldSoftRevert ?? false;
  config.ignoreGasUsedCheck = config.ignoreGasUsedCheck ?? false;

  const {
    nonce,
    strategy,
    l1Calldata,
    l2Recipient,
    deadline,
    shouldSoftRevert,
    ignoreGasUsedCheck,
  } = config;

  const tx = L1_NovaExecutionManager.exec(nonce, strategy, l1Calldata, l2Recipient, deadline);
  const awaitedTx = await tx;

  // Get events and gas used from the tx.
  const { gasUsed, events } = await awaitedTx.wait();
  const execCompletedEvent = events[events.length - 1];

  // Compute the execHash for the execution.
  const execHash = computeExecHash({
    nonce,
    strategy,
    calldata: l1Calldata.toString(),
    gasPrice: awaitedTx.gasPrice.toNumber(),
  });

  // Did it properly compute the request's execHash.
  execCompletedEvent.args.execHash.should.equal(execHash);

  // Was the relayer emitted as expected.
  execCompletedEvent.args.relayer.should.equal(caller);

  // Did the request soft revert like intended (or not).
  execCompletedEvent.args.reverted.should.equal(shouldSoftRevert);

  // @audit
  // if (!ignoreGasUsedCheck) {
  //   // The gasUsed estimate in the event should always be more than the actual gas used, but should never be more than 15,000 gas above.
  //   const overestimateAmount = execCompletedEvent.args.gasUsed.toNumber() - gasUsed.toNumber();
  //   overestimateAmount.should.be.within(0, 15_000);
  // }

  return { tx, execHash, gasUsed, execCompletedEvent, ...config };
}
