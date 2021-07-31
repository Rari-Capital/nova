import chalk from "chalk";
import ora from "ora";

import { task, types } from "hardhat/config";
import { TransactionResponse } from "@ethersproject/abstract-provider";

import { L1NovaExecutionManager } from "../typechain";

task("tune", "Tunes an execution manager's missing gas estimate based on single exec tx.")
  .addParam("txHash", "Transaction hash of an exec tx.")
  .addFlag(
    "update",
    "If enabled, the task will update the estimate on chain. If not enabled the task will just report the optimal estimate."
  )
  .setAction(async ({ txHash, update }, hre) => {
    const txPromise = hre.ethers.provider.getTransaction(txHash);
    const resolvedTx = await txPromise;

    const L1_NovaExecutionManager: L1NovaExecutionManager = (
      await hre.ethers.getContractFactory("L1_NovaExecutionManager")
    ).attach(resolvedTx.to) as any;

    if (update) {
      await tuneMissingGasEstimate(L1_NovaExecutionManager, txPromise);
    } else {
      console.log();

      const loader = ora({
        text: chalk.gray(`finding optimal missing gas estimate for tx: ${chalk.yellow(txHash)}\n`),
        color: "yellow",
        indent: 6,
      }).start();

      const { currentMissingGasEstimate, optimalMissingGasEstimate } =
        await findOptimalMissingGasEstimate(L1_NovaExecutionManager, txPromise);

      loader.stopAndPersist({
        symbol: chalk.yellow("✓"),
        text: chalk.gray(
          `based on this tx-hash, the optimal missing gas estimate would be ${chalk.yellow(
            optimalMissingGasEstimate.toString()
          )} (currently ${chalk.yellow(currentMissingGasEstimate.toString())})\n`
        ),
      });

      loader.indent = 0;
    }
  });

/**
 * Finds the optimal missing gas estimate for an execution manager based on a single exec tx.
 */
async function findOptimalMissingGasEstimate(
  L1_NovaExecutionManager: L1NovaExecutionManager,
  tx: Promise<TransactionResponse>
) {
  const { gasUsed, logs } = await (await tx).wait();

  // Since we accept a generic TransactionResponse we have to parse the logs manually.
  const execEvent = L1_NovaExecutionManager.interface.parseLog(logs[logs.length - 1]);

  // We are assuming that the current missing gas estimate was the missing gas estimate when
  // the transactions was executed. Don't try to use tune on really old transactions!
  const currentMissingGasEstimate = (await L1_NovaExecutionManager.missingGasEstimate()).toNumber();

  const underestimateAmount = gasUsed.toNumber() - execEvent.args.gasUsed.toNumber();

  return {
    currentMissingGasEstimate,
    optimalMissingGasEstimate: currentMissingGasEstimate + underestimateAmount,
  };
}

/**
 * Tunes an execution manager's missing gas estimate based on single exec tx.
 */
export async function tuneMissingGasEstimate(
  L1_NovaExecutionManager: L1NovaExecutionManager,
  tx: Promise<TransactionResponse>
) {
  const { currentMissingGasEstimate, optimalMissingGasEstimate } =
    await findOptimalMissingGasEstimate(L1_NovaExecutionManager, tx);

  console.log();

  const loader = ora({
    text: chalk.gray(
      `tuning missing gas estimate from ${chalk.magenta(
        currentMissingGasEstimate.toString()
      )} to ${chalk.magenta(optimalMissingGasEstimate.toString())}\n`
    ),
    color: "magenta",
    indent: 6,
  }).start();

  await (
    await L1_NovaExecutionManager.setMissingGasEstimate(
      // Update the gas estimate based on the delta (lower it if its over, increase it if its under) and give it 500 gas of leeway.
      optimalMissingGasEstimate + 500
    )
  ).wait();

  loader.stopAndPersist({
    symbol: chalk.magenta("✓"),
    text: chalk.gray(
      `tuned missing gas estimate from ${chalk.magenta(
        currentMissingGasEstimate.toString()
      )} to ${chalk.magenta(optimalMissingGasEstimate.toString())}\n`
    ),
  });

  loader.indent = 0;
}
