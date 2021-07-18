/** Converts Ethereum wei to gwei. */
export const gweiToWei = (gwei: string | number) => {
  return 1e9 * parseFloat(gwei.toString());
};

/** Promise that resolves after `ms` millisecond.s */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Console.logs msg with some space around it. */
function importantLog(msg: any) {
  console.log();
  console.log();
  console.log(msg);
  console.log();
  console.log();
}

/** Calls `operation`, if it throws an error it will retry `retires` times waiting `delaySeconds` between each retry. */
export function retryOperation(operation: () => any, delaySeconds: number, retries: number) {
  return new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          importantLog(
            `Failed to run task. Trying again after ${
              delaySeconds / 1000
            } seconds. Trying a max of ${retries - 1} more times after this next run.`
          );

          return sleep(delaySeconds)
            .then(retryOperation.bind(null, operation, delaySeconds, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });
}
