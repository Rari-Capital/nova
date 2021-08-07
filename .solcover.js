async function serverReadyHandler() {
  process.env.HARDHAT_COVERAGE_MODE_ENABLED = true;
}

module.exports = {
  skipFiles: ["mocks", "external"],
  onServerReady: serverReadyHandler,
};
