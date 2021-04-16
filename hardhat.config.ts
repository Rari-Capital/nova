import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";

import { gweiToWei } from "./utils";

// Plugins:
import "solidity-coverage";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import { removeConsoleLog } from "hardhat-preprocessor";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";

// Optimism plugins:
import "@eth-optimism/hardhat-ovm";

const config: HardhatUserConfig = {
  networks: {
    mainnet: {
      url: "https://mainnet.infura.io/v3/" + process.env.INFURA_KEY,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined,
      gasPrice: gweiToWei(process.env.GWEI_GAS_PRICE ?? "30"),
    },

    kovan: {
      url: "https://kovan.infura.io/v3/" + process.env.INFURA_KEY,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined,
      gasPrice: gweiToWei(process.env.GWEI_GAS_PRICE ?? "30"),
    },

    optimism: {
      url: "http://127.0.0.1:8545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined,
      // This sets the gas price to 0 for all transactions on L2. We do this
      // because account balances are not automatically initiated with an ETH
      // balance.
      gasPrice: 0,
      ovm: true, // This sets the network as using the ovm and ensure contract will be compiled against that.
    },
  },

  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },

      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
    },
  },

  preprocess: {
    eachLine: removeConsoleLog(
      (bre) =>
        bre.network.name !== "hardhat" && bre.network.name !== "localhost"
    ),
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  typechain: {
    target: "ethers-v5",
  },

  mocha: {
    timeout: 60_000,
  },

  gasReporter: {
    currency: "USD",
    gasPrice: parseInt(process.env.GWEI_GAS_PRICE ?? "20"),
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};

export default config;
