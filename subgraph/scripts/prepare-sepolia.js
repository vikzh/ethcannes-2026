const fs = require("node:fs");
const path = require("node:path");

function mustGetContract(deployments, name) {
  const value = deployments.contracts?.[name];
  if (!value?.address || value.deploymentBlock == null) {
    throw new Error(`Missing ${name} deployment in deployments/sepolia.json`);
  }
  return value;
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

  const template = fs.readFileSync(templatePath, "utf8");
  const result = template
    .replace(/__FACTORY_ADDRESS__/g, factory.address)
    .replace(/__FACTORY_START_BLOCK__/g, String(factory.deploymentBlock))
    .replace(/__WHITELIST_MODULE_ADDRESS__/g, whitelistModule.address)
    .replace(/__WHITELIST_MODULE_START_BLOCK__/g, String(whitelistModule.deploymentBlock));

  fs.writeFileSync(outputPath, result);
  console.log(`Generated ${outputPath}`);
}

main();
