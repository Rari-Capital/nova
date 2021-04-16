export const gweiToWei = (gwei: string | number) => {
  return 1e9 * parseFloat(gwei.toString());
};
