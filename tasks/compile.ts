import { task } from "hardhat/config";
import { TASK_COMPILE } from "hardhat/builtin-tasks/task-names";

task(TASK_COMPILE).setAction(async (args, hre: any, runSuper) => {
  // Don't run typechain for OVM because they will get included with the L1 types.
  if (hre.network.config.ovm) {
    return runSuper({ ...args, noTypechain: true });
  } else {
    return runSuper(args);
  }
});
