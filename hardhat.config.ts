import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";

import { gweiToWei } from "./utils";

// Plugins:
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { removeConsoleLog } from "hardhat-preprocessor";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";

// Optimism plugins:
import "@eth-optimism/hardhat-ovm";

import "./tasks";

const config: HardhatUserConfig = {
  networks: {
    mainnet: {
      url: "https://mainnet.infura.io/v3/" + process.env.INFURA_KEY,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined,
      gasPrice: gweiToWei(process.env.GWEI_GAS_PRICE ?? "50"),
    },

    kovan: {
      url: "https://kovan.infura.io/v3/" + process.env.INFURA_KEY,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined,
      gasPrice: gweiToWei(process.env.GWEI_GAS_PRICE ?? "10"),
    },

    optimism: {
      url: "http://127.0.0.1:8545",
      gasPrice: 0,
      ovm: true,
    },
  },

  ovm: {
    // This version supports ETH opcodes
    solcVersion: "0.7.6+commit.3b061308",
  },

  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1_000_000,
      },

      metadata: {
        bytecodeHash: "none",
      },
    },
  },

  preprocess: {
    eachLine: removeConsoleLog(
      (hre) => hre.network.name !== "hardhat" && hre.network.name !== "localhost"
    ),
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  typechain: {
    target: "ethers-v5",
  },

  paths: {
    tests: process.argv.includes("optimism") ? "test/integration" : "test/unit",
  },

  mocha: {
    // 5 minutes
    timeout: 300000,
  },

  gasReporter: {
    currency: "USD",
    gasPrice: parseInt(process.env.GWEI_GAS_PRICE ?? "100"),
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};

export default config;
