/** Converts Ethereum wei to gwei. */
export const gweiToWei = (gwei: string | number) => {
  return 1e9 * parseFloat(gwei.toString());
};

/** Promise that resolves after `ms` millisecond.s */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls `operation`, if it throws an error it will retry `retires` times waiting `delaySeconds` between each retry. */
export function retryOperation(operation: () => any, delaySeconds: number, retries: number) {
  return new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          return sleep(delaySeconds)
            .then(retryOperation.bind(null, operation, delaySeconds, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });
}
