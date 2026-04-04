import hre from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const hh = hre as any;

type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: string;
  deployedAt: string;
  contracts: Record<string, { address: string; deploymentBlock: number }>;
};

function requireAccountAddress(): string {
  const value = process.env.ACCOUNT_ADDRESS?.trim();
  if (!value || !hh.ethers.isAddress(value)) {
    throw new Error("ACCOUNT_ADDRESS env var is required and must be a valid address");
  }
  return value;
}

function getMintAmount(): bigint {
  const raw = process.env.MOCK_ERC20_MINT_AMOUNT?.trim();
  if (raw && raw !== "") return BigInt(raw);
  return hh.ethers.parseUnits("1000", 18);
}

async function loadDeploymentFile(p: string): Promise<DeploymentRecord | null> {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as DeploymentRecord;
  } catch {
    return null;
  }
}

async function main() {
  const { ethers, network } = hh;
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  let nextNonce = await ethers.provider.getTransactionCount(deployerAddress, "pending");

  const accountAddress = requireAccountAddress();
  const mintAmount = getMintAmount();

  const tokenFactory = await ethers.getContractFactory("MockERC20");
  const token = await tokenFactory.deploy({ nonce: nextNonce++ });
  await token.waitForDeployment();
  const deployReceipt = await token.deploymentTransaction()?.wait();
  if (!deployReceipt) throw new Error("Missing deployment receipt for MockERC20");
  const tokenAddress = await token.getAddress();

  const mintTx = await token.mint(accountAddress, mintAmount, { nonce: nextNonce++ });
  const mintReceipt = await mintTx.wait();
  if (!mintReceipt) throw new Error("Missing mint receipt");

  const balance = await token.balanceOf(accountAddress);

  const deploymentsPath = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const existing = await loadDeploymentFile(deploymentsPath);
  const output: DeploymentRecord = existing ?? {
    network: network.name,
    chainId,
    deployer: deployerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {},
  };
  output.contracts.MockERC20 = {
    address: tokenAddress,
    deploymentBlock: deployReceipt.blockNumber,
  };
  await writeFile(deploymentsPath, JSON.stringify(output, null, 2));

  console.log("MockERC20 deployed and minted:");
  console.log(`- token: ${tokenAddress}`);
  console.log(`- account: ${accountAddress}`);
  console.log(`- mintAmount: ${mintAmount}`);
  console.log(`- accountBalance: ${balance}`);
  console.log(`- deployTx: ${deployReceipt.hash}`);
  console.log(`- mintTx: ${mintReceipt.hash}`);
  console.log(`- updated deployment file: ${deploymentsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
