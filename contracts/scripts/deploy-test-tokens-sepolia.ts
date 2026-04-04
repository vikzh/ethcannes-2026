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

function getTokenCount(): number {
  const raw = process.env.TOKEN_COUNT?.trim();
  const count = raw ? Number(raw) : 3;
  if (!Number.isInteger(count) || count <= 0 || count > 20) {
    throw new Error(`Invalid TOKEN_COUNT: ${raw ?? ""}. Expected integer between 1 and 20.`);
  }
  return count;
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

  const accountAddress = requireAccountAddress();
  const mintAmount = getMintAmount();
  const tokenCount = getTokenCount();

  const deploymentsPath = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const existing = await loadDeploymentFile(deploymentsPath);
  const output: DeploymentRecord = existing ?? {
    network: network.name,
    chainId,
    deployer: deployerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {},
  };

  const tokenFactory = await ethers.getContractFactory("MockERC20");
  const deployedTokens: string[] = [];

  for (let i = 1; i <= tokenCount; i++) {
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();
    const deployReceipt = await token.deploymentTransaction()?.wait();
    if (!deployReceipt) throw new Error(`Missing deployment receipt for token #${i}`);
    const tokenAddress = await token.getAddress();

    const mintTx = await token.mint(accountAddress, mintAmount);
    await mintTx.wait();
    const balance = await token.balanceOf(accountAddress);

    const key = `MockERC20_${i}`;
    output.contracts[key] = {
      address: tokenAddress,
      deploymentBlock: deployReceipt.blockNumber,
    };
    deployedTokens.push(tokenAddress);

    console.log(
      `Token #${i} deployed ${tokenAddress}, minted ${mintAmount.toString()} (balance ${balance.toString()})`
    );
  }

  await writeFile(deploymentsPath, JSON.stringify(output, null, 2));
  console.log(`Updated deployment file: ${deploymentsPath}`);
  console.log(`Deployed test tokens: ${deployedTokens.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
