import { ethers, network } from "hardhat";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const MODE_SINGLE = "0x00" + "00".repeat(31);
export const NATIVE_TRANSFER_SELECTOR = "0x00000000";

type DeploymentRecord = {
  contracts: Record<string, { address: string; deploymentBlock: number }>;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export function parseEnvAddress(name: string): string {
  const value = requireEnv(name);
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

export function parseTransferWei(): bigint {
  const raw = process.env.TRANSFER_WEI?.trim();
  return raw ? BigInt(raw) : ethers.parseEther("0.0001");
}

export function parseTokenAmount(): bigint {
  const raw = process.env.TOKEN_AMOUNT?.trim();
  return raw ? BigInt(raw) : ethers.parseUnits("1", 18);
}

export function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

export async function signExecuteAuthorized(
  agentWallet: any,
  accountAddress: string,
  mode: string,
  executionCalldata: string,
  nonce: bigint,
  deadline: bigint = 0n
): Promise<string> {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  return agentWallet.signTypedData(
    {
      name: "IsolatedAccount",
      version: "1",
      chainId,
      verifyingContract: accountAddress,
    },
    {
      ExecuteRequest: [
        { name: "mode", type: "bytes32" },
        { name: "executionCalldataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      mode,
      executionCalldataHash: ethers.keccak256(executionCalldata),
      nonce,
      deadline,
    }
  );
}

export async function loadDeployments(): Promise<DeploymentRecord> {
  const p = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as DeploymentRecord;
}

export async function getContext() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got ${network.name}`);
  }

  const deployments = await loadDeployments();
  const [owner] = await ethers.getSigners();
  const provider = ethers.provider;
  const agentMnemonic = requireEnv("AGENT_MNEMONIC");
  const agentWallet = ethers.Wallet.fromPhrase(agentMnemonic).connect(provider);

  const accountAddress = parseEnvAddress("ACCOUNT_ADDRESS");
  const recipientAddress = parseEnvAddress("RECIPIENT_ADDRESS");

  const policyHookAddress = deployments.contracts.PolicyHook.address;
  const whitelistModuleAddress = deployments.contracts.WhitelistRequestModule.address;
  const mockTokenAddress =
    process.env.MOCK_TOKEN_ADDRESS ||
    deployments.contracts.MockERC20_1?.address ||
    deployments.contracts.MockERC20?.address;
  if (!mockTokenAddress || !ethers.isAddress(mockTokenAddress)) {
    throw new Error(
      "Missing MOCK_TOKEN_ADDRESS and no MockERC20_1/MockERC20 entry found in deployments/sepolia.json"
    );
  }

  const account = await ethers.getContractAt("IsolatedAccount", accountAddress, owner);
  const policyHook = await ethers.getContractAt("PolicyHook", policyHookAddress, owner);
  const whitelistModule = await ethers.getContractAt(
    "WhitelistRequestModule",
    whitelistModuleAddress,
    owner
  );
  const mockToken = await ethers.getContractAt("MockERC20", mockTokenAddress, owner);

  return {
    owner,
    agentWallet,
    accountAddress,
    recipientAddress,
    transferWei: parseTransferWei(),
    tokenAmount: parseTokenAmount(),
    mockTokenAddress,
    account,
    policyHook,
    whitelistModule,
    mockToken,
  };
}

export async function maybeQuerySubgraph(accountAddress: string): Promise<void> {
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) {
    console.log("GRAPH_API_KEY not set, skipping subgraph query.");
    return;
  }
  const subgraphId = process.env.GRAPH_SUBGRAPH_ID || "ApzeUQepZLrJdxtipSY6nVJYPb62kjKNFv8orpBRLk1E";
  const url = `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`;
  const body = {
    query: `{
      whitelistRequests(first: 5, where: { account: "${accountAddress.toLowerCase()}", status: "Pending" }) {
        id
        account
        requestId
        target
        selector
        metadata
      }
    }`,
    operationName: "PendingRequests",
    variables: {},
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log("Subgraph response:", JSON.stringify(json));
}
