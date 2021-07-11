import { BytesLike } from "ethers";
import { ethers } from "hardhat";
import { computeExecHash } from ".";
import { getFactory } from "..";
import {
  L1NovaExecutionManager,
  L2NovaRegistry__factory,
  MockCrossDomainMessenger__factory,
} from "../../../typechain";

/**
 * We use this global counter to
 * generate unique (but deterministic values)
 * for nonce in executeRequest.
 */
let globalNonce: number = 0;

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
  config.nonce = globalNonce++;
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
  execEvent.args.relayer.should.equal(caller);

  // Did the request soft revert like intended (or not).
  execEvent.args.reverted.should.equal(shouldSoftRevert);

  const estimatedGas = execEvent.args.gasUsed.toNumber();
  if (!ignoreGasUsedCheck) {
    // The gasUsed estimate in the event should always be more than the actual gas used, but should never be more than 16,000 gas above.
    const overestimateAmount = estimatedGas - gasUsed.toNumber();
    if (overestimateAmount >= 500) {
      console.log("Exec Overestimated By:", overestimateAmount, "gas");
    }
    overestimateAmount.should.be.within(0, 16_000);
  }

  // Check messenger to make sure data was properly passed into it.
  const messenger = (
    await getFactory<MockCrossDomainMessenger__factory>("MockCrossDomainMessenger")
  ).attach(await L1_NovaExecutionManager.messenger());

  await messenger
    .latestGasLimit()
    .should.eventually.equal(await L1_NovaExecutionManager.EXEC_COMPLETED_MESSAGE_GAS_LIMIT());
  await messenger.latestSender().should.eventually.equal(L1_NovaExecutionManager.address);
  await messenger
    .latestTarget()
    .should.eventually.equal(await L1_NovaExecutionManager.L2_NovaRegistryAddress());
  await messenger
    .latestMessage()
    .should.eventually.equal(
      (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).interface.encodeFunctionData("execCompleted", [
        execHash,
        l2Recipient,
        shouldSoftRevert,
        estimatedGas,
      ])
    );

  return { tx, execHash, gasUsed, execEvent, ...config };
}
