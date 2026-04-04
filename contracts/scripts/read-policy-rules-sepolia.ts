import { ethers, network } from "hardhat";
import { readFile } from "node:fs/promises";
import path from "node:path";

type DeploymentRecord = {
  contracts: Record<string, { address: string; deploymentBlock: number }>;
};

function requireEnvAddress(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} env var is required and must be a valid address`);
  }
  return value;
}

async function loadDeploymentRecord(): Promise<DeploymentRecord> {
  const deploymentPath = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const raw = await readFile(deploymentPath, "utf8");
  return JSON.parse(raw) as DeploymentRecord;
}

function bytes32ToAddress(word: string): string {
  return ethers.getAddress("0x" + word.slice(-40));
}

function toJsonSafe<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
  ) as T;
}

async function main() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const accountAddress = requireEnvAddress("ACCOUNT_ADDRESS");
  const deployments = await loadDeploymentRecord();
  const policyHookAddress =
    process.env.POLICY_HOOK_ADDRESS?.trim() ||
    deployments.contracts.PolicyHookRuleSpend?.address ||
    deployments.contracts.PolicyHook?.address;

  if (!policyHookAddress || !ethers.isAddress(policyHookAddress)) {
    throw new Error("Missing POLICY_HOOK_ADDRESS and no PolicyHookRuleSpend/PolicyHook in deployments");
  }

  const hook = await ethers.getContractAt("PolicyHookRuleSpend", policyHookAddress);

  const [rules, wlEntries, spendLimits, policy] = await Promise.all([
    hook.getRules(accountAddress),
    hook.getWhitelistEntries(accountAddress),
    hook.getSpendLimits(accountAddress),
    hook.getPolicy(accountAddress),
  ]);

  const transferSelector = ethers.id("transfer(address,uint256)").slice(0, 10).toLowerCase();

  const decodedRules = rules.map((r: any) => {
    const selector = String(r.selector).toLowerCase();
    const decodedConditions = r.conditions.map((c: any) => {
      const raw = String(c.expectedValue);
      const candidateAddress = bytes32ToAddress(raw);
      const candidateUint = BigInt(raw).toString();
      const condition: Record<string, unknown> = {
        paramIndex: Number(c.paramIndex),
        expectedValueRaw: raw,
        candidateAddress,
        candidateUint,
      };
      if (selector === transferSelector && Number(c.paramIndex) === 0) {
        condition.interpretedAs = "transfer.to";
      }
      if (selector === transferSelector && Number(c.paramIndex) === 1) {
        condition.interpretedAs = "transfer.amount";
      }
      return condition;
    });

    return {
      ruleId: String(r.ruleId),
      target: String(r.target),
      selector: String(r.selector),
      spendParamIndex: Number(r.spendParamIndex),
      maxPerPeriod: BigInt(r.maxPerPeriod).toString(),
      periodDuration: BigInt(r.periodDuration).toString(),
      spentInPeriod: BigInt(r.spentInPeriod).toString(),
      periodStart: BigInt(r.periodStart).toString(),
      conditions: decodedConditions,
    };
  });

  const result = {
    account: accountAddress,
    policyHook: policyHookAddress,
    policy: {
      nativeValueCapPerTx: BigInt(policy.nativeValueCapPerTx).toString(),
      paused: Boolean(policy.paused),
    },
    whitelistEntries: wlEntries.map((e: any) => ({
      target: String(e.target),
      selector: String(e.selector),
    })),
    spendLimits: spendLimits.map((s: any) => ({
      token: String(s.token),
      maxPerPeriod: BigInt(s.maxPerPeriod).toString(),
      periodDuration: BigInt(s.periodDuration).toString(),
      spentInPeriod: BigInt(s.spentInPeriod).toString(),
      periodStart: BigInt(s.periodStart).toString(),
    })),
    rules: decodedRules,
  };

  console.log("Policy rules (UI-friendly + raw candidates):");
  console.log(JSON.stringify(toJsonSafe(result), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
