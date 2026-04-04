const fs = require("node:fs");
const path = require("node:path");

function mustGetContract(deployments, name) {
  const value = deployments.contracts?.[name];
  if (!value?.address || value.deploymentBlock == null) {
    throw new Error(`Missing ${name} deployment in deployments/sepolia.json`);
  }
  return value;
}

function getContractWithFallback(deployments, primaryName, fallbackName) {
  const primary = deployments.contracts?.[primaryName];
  if (primary?.address && primary.deploymentBlock != null) {
    return primary;
  }
  if (fallbackName) {
    return mustGetContract(deployments, fallbackName);
  }
  return mustGetContract(deployments, primaryName);
}

function main() {
  const root = path.resolve(__dirname, "..");
  const deploymentsPath = path.resolve(root, "..", "contracts", "deployments", "sepolia.json");
  const templatePath = path.resolve(root, "subgraph.template.yaml");
  const outputPath = path.resolve(root, "subgraph.yaml");

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`Deployment file not found: ${deploymentsPath}`);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const factory = mustGetContract(deployments, "AbstractAccountFactory");
  const whitelistModule = mustGetContract(deployments, "WhitelistRequestModule");
  const policyHook = getContractWithFallback(deployments, "PolicyHookRuleSpend", "PolicyHook");
  const agentSessionValidator = mustGetContract(deployments, "AgentSessionValidator");
  const buildTag = process.env.SUBGRAPH_BUILD_TAG?.trim() || `local-${Date.now()}`;
  const offsetRaw = process.env.SUBGRAPH_START_BLOCK_OFFSET?.trim();
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 200;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const startBlock = (n) => Math.max(0, Number(n) - safeOffset);

  const template = fs.readFileSync(templatePath, "utf8");
  const result = template
    .replace(/__FACTORY_ADDRESS__/g, factory.address)
    .replace(/__FACTORY_START_BLOCK__/g, String(startBlock(factory.deploymentBlock)))
    .replace(/__WHITELIST_MODULE_ADDRESS__/g, whitelistModule.address)
    .replace(
      /__WHITELIST_MODULE_START_BLOCK__/g,
      String(startBlock(whitelistModule.deploymentBlock))
    )
    .replace(/__POLICY_HOOK_ADDRESS__/g, policyHook.address)
    .replace(/__POLICY_HOOK_START_BLOCK__/g, String(startBlock(policyHook.deploymentBlock)))
    .replace(/__AGENT_SESSION_VALIDATOR_ADDRESS__/g, agentSessionValidator.address)
    .replace(
      /__AGENT_SESSION_VALIDATOR_START_BLOCK__/g,
      String(startBlock(agentSessionValidator.deploymentBlock))
    )
    .replace(/__BUILD_TAG__/g, buildTag);

  fs.writeFileSync(outputPath, result);
  console.log(`Generated ${outputPath} (start block offset: ${safeOffset}, build tag: ${buildTag})`);
}

main();
