export const gweiToWei = (gwei: string | number) => {
  return 1e9 * parseFloat(gwei.toString());
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function importantLog(msg: any) {
  console.log();
  console.log();
  console.log(msg);
  console.log();
  console.log();
}

export function retryOperation(
  operation: () => any,
  delay: number,
  retries: number
) {
  return new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          importantLog(
            `Failed to run task. Trying again after ${
              delay / 1000
            } seconds. Trying a max of ${
              retries - 1
            } more times after this next run.`
          );

          return sleep(delay)
            .then(retryOperation.bind(null, operation, delay, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });
}
