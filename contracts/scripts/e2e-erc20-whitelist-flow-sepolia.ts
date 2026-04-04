import { ethers, network } from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWalletSepolia } from "./create-wallet-sepolia";
import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";
import { logSubgraphStep, waitForSubgraphIndexingMs } from "./utils/subgraph";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isExpectedRevert(err: unknown): boolean {
  const e = err as { code?: string; message?: string; shortMessage?: string };
  const msg = `${e?.message || ""} ${e?.shortMessage || ""}`;
  return (
    e?.code === "CALL_EXCEPTION" ||
    /revert/i.test(msg) ||
    /transaction reverted/i.test(msg)
  );
}

async function mergeMockIntoDeployments(tokenAddress: string, deployBlock: number): Promise<void> {
  const deploymentsPath = path.resolve(process.cwd(), "deployments", "sepolia.json");
  const raw = await readFile(deploymentsPath, "utf8");
  const j = JSON.parse(raw) as Record<string, unknown>;
  const contracts = (j.contracts as Record<string, { address: string; deploymentBlock: number }>) ?? {};
  contracts.MockERC20 = { address: tokenAddress, deploymentBlock: deployBlock };
  j.contracts = contracts;
  await writeFile(deploymentsPath, JSON.stringify(j, null, 2));
}

async function main() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const agentMnemonic = requireEnv("AGENT_MNEMONIC");
  const recipientAddress = requireEnv("RECIPIENT_ADDRESS");
  const agentWallet = ethers.Wallet.fromPhrase(agentMnemonic).connect(ethers.provider);
  process.env.AGENT_ADDRESS = await agentWallet.getAddress();
  process.env.RECIPIENT_ADDRESS = recipientAddress;

  console.log("\n======== Step 1: Create isolated account ========");
  const { accountAddress } = await createWalletSepolia();
  process.env.ACCOUNT_ADDRESS = accountAddress;
  await waitForSubgraphIndexingMs();
  await logSubgraphStep("1-after-account-created", accountAddress);

  console.log("\n======== Step 2: Deploy MockERC20 + mint to account ========");
  const [deployer] = await ethers.getSigners();
  const tokenFactory = await ethers.getContractFactory("MockERC20");
  const token = await tokenFactory.connect(deployer).deploy();
  await token.waitForDeployment();
  const depRec = await token.deploymentTransaction()?.wait();
  if (!depRec) throw new Error("Missing MockERC20 deployment receipt");

  const tokenAddress = await token.getAddress();
  const mintAmount = process.env.MOCK_ERC20_MINT_AMOUNT?.trim()
    ? BigInt(process.env.MOCK_ERC20_MINT_AMOUNT!.trim())
    : ethers.parseUnits("1000", 18);

  await (await token.mint(accountAddress, mintAmount)).wait();
  process.env.MOCK_TOKEN_ADDRESS = tokenAddress;
  await mergeMockIntoDeployments(tokenAddress, depRec.blockNumber);
  console.log(`Token ${tokenAddress} — minted ${mintAmount} to ${accountAddress}`);
  await waitForSubgraphIndexingMs();
  await logSubgraphStep("2-after-mint-on-chain-only-no-token-in-subgraph", accountAddress);

  console.log("\n======== Step 3: Agent ERC20 transfer (expect revert — not whitelisted) ========");
  const ctx3 = await getContext();
  const transferCall = ctx3.mockToken.interface.encodeFunctionData("transfer", [
    ctx3.recipientAddress,
    ctx3.tokenAmount,
  ]);
  const executionCalldata = encodeSingle(ctx3.mockTokenAddress, 0n, transferCall);
  let nonce = await ctx3.account.nonce();
  let sig = await signExecuteAuthorized(
    ctx3.agentWallet,
    ctx3.accountAddress,
    MODE_SINGLE,
    executionCalldata,
    nonce
  );

  try {
    const tx = await ctx3.account
      .connect(ctx3.agentWallet)
      .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig, { gasLimit: 900000 });
    await tx.wait();
    throw new Error("ERC20 transfer unexpectedly succeeded before whitelist.");
  } catch (err) {
    if (!isExpectedRevert(err)) throw err;
    console.log("OK: transfer reverted as expected (policy blocks unlisted selector).");
  }

  await waitForSubgraphIndexingMs();
  await logSubgraphStep(
    "3-after-failed-transfer-whole-tx-reverted-typically-no-new-subgraph-rows",
    accountAddress
  );

  console.log("\n======== Step 4: Agent requests whitelist for transfer(address,uint256) ========");
  const ctx4 = await getContext();
  const transferSelector = ctx4.mockToken.interface.getFunction("transfer")!.selector;
  const requestSelector = ctx4.whitelistModule.interface.getFunction("requestWhitelistAddition")!.selector;

  const wlModuleAddr = await ctx4.whitelistModule.getAddress();
  const isRequestWhitelisted = await ctx4.policyHook.isWhitelisted(
    ctx4.accountAddress,
    wlModuleAddr,
    requestSelector
  );

  if (!isRequestWhitelisted) {
    const callData = ctx4.policyHook.interface.encodeFunctionData("addWhitelistEntry", [
      wlModuleAddr,
      requestSelector,
    ]);
    const hookAddr = await ctx4.policyHook.getAddress();
    const tx = await ctx4.account.execute(MODE_SINGLE, encodeSingle(hookAddr, 0n, callData));
    await tx.wait();
    console.log("Owner path: whitelisted requestWhitelistAddition on module.");
  }

  const requestCall = ctx4.whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
    ctx4.mockTokenAddress,
    transferSelector,
    "e2e erc20 whitelist flow",
  ]);
  const requestExec = encodeSingle(wlModuleAddr, 0n, requestCall);
  nonce = await ctx4.account.nonce();
  sig = await signExecuteAuthorized(
    ctx4.agentWallet,
    ctx4.accountAddress,
    MODE_SINGLE,
    requestExec,
    nonce
  );

  const reqTx = await ctx4.account
    .connect(ctx4.agentWallet)
    .executeAuthorized(MODE_SINGLE, requestExec, nonce, 0n, sig, { gasLimit: 900000 });
  await reqTx.wait();
  console.log(`Whitelist request tx: ${reqTx.hash}`);

  await waitForSubgraphIndexingMs();
  await logSubgraphStep("4-after-whitelist-request-Pending-in-subgraph", accountAddress);

  console.log("\n======== Step 5: Owner approves request ========");
  const ctx5 = await getContext();
  const pending = await ctx5.whitelistModule.getPendingRequests(ctx5.accountAddress);
  if (pending.length === 0) throw new Error("No pending whitelist requests.");
  const latest = pending[pending.length - 1];
  const requestId = latest.requestId;
  console.log(`Approving requestId ${requestId}`);

  const approveCall = ctx5.whitelistModule.interface.encodeFunctionData("approveRequest", [
    requestId,
    await ctx5.policyHook.getAddress(),
  ]);
  const appTx = await ctx5.account.execute(
    MODE_SINGLE,
    encodeSingle(await ctx5.whitelistModule.getAddress(), 0n, approveCall)
  );
  await appTx.wait();
  console.log(`Approve tx: ${appTx.hash}`);

  const whitelisted = await ctx5.policyHook.isWhitelisted(
    ctx5.accountAddress,
    ctx5.mockTokenAddress,
    transferSelector
  );
  if (!whitelisted) throw new Error("Token transfer still not whitelisted after approve.");

  await waitForSubgraphIndexingMs();
  await logSubgraphStep("5-after-approve-WhitelistEntry-active-in-subgraph", accountAddress);

  console.log("\n======== Step 6: Agent transfer (expect success) ========");
  const ctx6 = await getContext();
  const transferCall2 = ctx6.mockToken.interface.encodeFunctionData("transfer", [
    ctx6.recipientAddress,
    ctx6.tokenAmount,
  ]);
  const exec2 = encodeSingle(ctx6.mockTokenAddress, 0n, transferCall2);
  const nonce6 = await ctx6.account.nonce();
  const sig6 = await signExecuteAuthorized(
    ctx6.agentWallet,
    ctx6.accountAddress,
    MODE_SINGLE,
    exec2,
    nonce6
  );

  const recBefore = await ctx6.mockToken.balanceOf(ctx6.recipientAddress);
  const passTx = await ctx6.account
    .connect(ctx6.agentWallet)
    .executeAuthorized(MODE_SINGLE, exec2, nonce6, 0n, sig6, { gasLimit: 900000 });
  await passTx.wait();
  console.log(`ERC20 transfer tx: ${passTx.hash}`);

  const recAfter = await ctx6.mockToken.balanceOf(ctx6.recipientAddress);
  const delta = recAfter - recBefore;
  if (delta < ctx6.tokenAmount) {
    throw new Error(`Recipient delta ${delta} < TOKEN_AMOUNT ${ctx6.tokenAmount}`);
  }

  await waitForSubgraphIndexingMs();
  await logSubgraphStep("6-after-successful-transfer-ExecutionEnvelope-Executed-in-subgraph", accountAddress);

  console.log("\nDone. Set SUBGRAPH_QUERY_URL (or GRAPH_API_KEY + GRAPH_SUBGRAPH_ID) and SUBGRAPH_WAIT_MS as needed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
