import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const dotenvPath = path.resolve(__dirname, ".env");
if (existsSync(dotenvPath)) {
  const raw = readFileSync(dotenvPath, "utf8");
  for (const row of raw.split("\n")) {
    const line = row.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "";
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const mnemonic = process.env.MNEMONIC;
const sepoliaAccounts = mnemonic
  ? { mnemonic }
  : deployerPrivateKey
    ? [deployerPrivateKey]
    : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  networks: {
    sepolia: {
      url: sepoliaRpcUrl,
      accounts: sepoliaAccounts,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

export default config;
