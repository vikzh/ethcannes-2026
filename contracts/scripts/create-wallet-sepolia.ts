import { ethers, network } from "hardhat";
import { readFile } from "node:fs/promises";
import path from "node:path";

type DeploymentRecord = {
  contracts: Record<string, { address: string; deploymentBlock: number }>;
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value.toLowerCase() === "true";
}

function requireAddress(value: string, name: string): string {
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return value;
}

function resolveSalt(rawSalt: string | undefined): string {
  if (!rawSalt || rawSalt.trim() === "") {
    return ethers.keccak256(ethers.toUtf8Bytes(`wallet-${Date.now()}`));
  }
  const s = rawSalt.trim();
  if (ethers.isHexString(s, 32)) return s;
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

async function loadDeploymentRecord(): Promise<DeploymentRecord> {
  const deploymentPath = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const raw = await readFile(deploymentPath, "utf8");
  return JSON.parse(raw) as DeploymentRecord;
}

export type CreateWalletResult = {
  accountAddress: string;
  owner: string;
  txHash: string;
  blockNumber: number;
};

export async function createWalletSepolia(): Promise<CreateWalletResult> {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const [owner] = await ethers.getSigners();
  const deployerAddress = await owner.getAddress();
  const targetOwnerAddress = process.env.OWNER_ADDRESS
    ? requireAddress(process.env.OWNER_ADDRESS, "OWNER_ADDRESS")
    : deployerAddress;
  const deployments = await loadDeploymentRecord();

  const policyHookAddress = requireAddress(
    process.env.POLICY_HOOK_ADDRESS || deployments.contracts.PolicyHook.address,
    "POLICY_HOOK_ADDRESS"
  );
  const factoryAddress = requireAddress(
    process.env.FACTORY_ADDRESS || deployments.contracts.AbstractAccountFactory.address,
    "FACTORY_ADDRESS"
  );
  const whitelistModuleAddress = requireAddress(
    process.env.WHITELIST_MODULE_ADDRESS || deployments.contracts.WhitelistRequestModule.address,
    "WHITELIST_MODULE_ADDRESS"
  );
  const emergencyControlsAddress = requireAddress(
    process.env.EMERGENCY_CONTROLS_ADDRESS || deployments.contracts.EmergencyControls.address,
    "EMERGENCY_CONTROLS_ADDRESS"
  );
  const agentSessionValidatorAddress = requireAddress(
    process.env.AGENT_SESSION_VALIDATOR_ADDRESS || deployments.contracts.AgentSessionValidator.address,
    "AGENT_SESSION_VALIDATOR_ADDRESS"
  );

  const installWhitelist = parseBool(process.env.INSTALL_WHITELIST_MODULE, true);
  const installEmergency = parseBool(process.env.INSTALL_EMERGENCY_CONTROLS, true);
  const installAgentValidator = parseBool(process.env.INSTALL_AGENT_SESSION_VALIDATOR, true);
  const rawAgentAddress = process.env.AGENT_ADDRESS || targetOwnerAddress;
  const agentAddress = requireAddress(rawAgentAddress, "AGENT_ADDRESS");
  const validAfter = BigInt(process.env.AGENT_VALID_AFTER || "0");
  const validUntil = BigInt(process.env.AGENT_VALID_UNTIL || "0");
  const agentFundWei = process.env.AGENT_FUND_WEI?.trim()
    ? BigInt(process.env.AGENT_FUND_WEI!.trim())
    : 0n;

  const salt = resolveSalt(process.env.WALLET_SALT);

  const factory = await ethers.getContractAt("AbstractAccountFactory", factoryAddress, owner);
  const predicted = await factory.predictAccountAddress(
    salt,
    policyHookAddress,
    installWhitelist ? whitelistModuleAddress : ethers.ZeroAddress
  );
  const existingCode = await ethers.provider.getCode(predicted);
  if (existingCode !== "0x") {
    throw new Error(`Predicted account already deployed at ${predicted}. Use a different WALLET_SALT.`);
  }

  const modules: Array<{ module: string; initData: string }> = [];
  modules.push({ module: policyHookAddress, initData: "0x" });

  if (installWhitelist) {
    modules.push({ module: whitelistModuleAddress, initData: "0x" });
  }
  if (installEmergency) {
    modules.push({ module: emergencyControlsAddress, initData: "0x" });
  }
  if (installAgentValidator) {
    const initData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint48", "uint48"],
      [agentAddress, validAfter, validUntil]
    );
    modules.push({ module: agentSessionValidatorAddress, initData });
  }

  console.log("Creating wallet with:");
  console.log(`- deployer: ${deployerAddress}`);
  console.log(`- target owner: ${targetOwnerAddress}`);
  console.log(`- agent: ${agentAddress}`);
  console.log(`- factory: ${factoryAddress}`);
  console.log(`- policyHook: ${policyHookAddress}`);
  console.log(`- salt: ${salt}`);
  console.log(`- predicted account: ${predicted}`);
  console.log(`- modules count: ${modules.length}`);
  if (agentFundWei > 0n) {
    console.log(`- agent funding (wei): ${agentFundWei}`);
  }

  const tx = await factory.deployAccount(
    salt,
    policyHookAddress,
    installWhitelist ? whitelistModuleAddress : ethers.ZeroAddress,
    modules,
    agentAddress,
    installAgentValidator ? agentSessionValidatorAddress : ethers.ZeroAddress,
    {
    value: agentFundWei,
  });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Missing deployment tx receipt");

  const account = await ethers.getContractAt("IsolatedAccount", predicted, owner);

  if (targetOwnerAddress.toLowerCase() !== deployerAddress.toLowerCase()) {
    const transferTx = await account.transferOwnership(targetOwnerAddress);
    await transferTx.wait();
    console.log(`- ownership transferred to: ${targetOwnerAddress}`);
  }

  const onchainOwner = await account.owner();
  if (onchainOwner.toLowerCase() !== targetOwnerAddress.toLowerCase()) {
    throw new Error(`Owner mismatch after setup. expected=${targetOwnerAddress} actual=${onchainOwner}`);
  }

  console.log("Wallet created successfully:");
  console.log(`- account: ${predicted}`);
  console.log(`- owner: ${onchainOwner}`);
  console.log(`- txHash: ${receipt.hash}`);
  console.log(`- block: ${receipt.blockNumber}`);

  return {
    accountAddress: predicted,
    owner: onchainOwner,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

async function main() {
  await createWalletSepolia();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
