import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";

// Plugins:
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "solidity-coverage";
import "hardhat-interface-generator";
import { removeConsoleLog } from "hardhat-preprocessor";

// Optimism plugins:
import "@eth-optimism/hardhat-ovm";

// Tasks:
import "./tasks";

const config: HardhatUserConfig = {
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },

    kovan: {
      url: process.env.KOVAN_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },

    optimisticMainnet: {
      url: "https://mainnet.optimism.io",
      accounts: [process.env.PRIVATE_KEY],
      ovm: true,
    },

    optimisticKovan: {
      url: "https://kovan.optimism.io",
      accounts: [process.env.PRIVATE_KEY],
      ovm: true,
    },

    optimism: {
      url: "http://localhost:8545",
      accounts: ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
      ovm: true,
    },
  },

  ovm: {
    // This version supports ETH opcodes:
    solcVersion: "0.7.6+commit.3b061308",
  },

  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },

      metadata: {
        bytecodeHash: "none",
      },
    },
  },

  paths: {
    tests:
      process.argv.includes("optimism") || process.argv.includes("optimisticKovan")
        ? "test/integration"
        : "test/unit",
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  typechain: {
    target: "ethers-v5",
  },

  mocha: {
    // 5 minutes:
    timeout: 300000,
  },

  preprocess: {
    eachLine: removeConsoleLog(
      (hre) => hre.network.name !== "hardhat" && hre.network.name !== "localhost"
    ),
  },

  gasReporter: {
    currency: "USD",
    gasPrice: 30,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};

export default config;
