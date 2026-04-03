import { ethers, network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: string;
  deployedAt: string;
  contracts: Record<string, { address: string; deploymentBlock: number }>;
};

async function main() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`Deploying with ${deployerAddress} on chain ${chainId} (${network.name})`);

  const deployContract = async (name: string) => {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const receipt = await contract.deploymentTransaction()?.wait();
    if (!receipt) {
      throw new Error(`Missing deployment receipt for ${name}`);
    }

    return {
      address: await contract.getAddress(),
      deploymentBlock: receipt.blockNumber,
    };
  };

  const policyHook = await deployContract("PolicyHook");
  const agentSessionValidator = await deployContract("AgentSessionValidator");
  const whitelistRequestModule = await deployContract("WhitelistRequestModule");
  const emergencyControls = await deployContract("EmergencyControls");
  const abstractAccountFactory = await deployContract("AbstractAccountFactory");

  const output: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {
      PolicyHook: policyHook,
      AgentSessionValidator: agentSessionValidator,
      WhitelistRequestModule: whitelistRequestModule,
      EmergencyControls: emergencyControls,
      AbstractAccountFactory: abstractAccountFactory,
    },
  };

  const deploymentsDir = path.resolve(process.cwd(), "deployments");
  await mkdir(deploymentsDir, { recursive: true });
  const outputPath = path.join(deploymentsDir, `${network.name}.json`);
  await writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Saved deployment file: ${outputPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
