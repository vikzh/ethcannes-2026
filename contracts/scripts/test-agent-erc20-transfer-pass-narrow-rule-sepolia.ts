import { ethers, network } from "hardhat";
import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";
import { waitForSubgraphIndexingMs } from "./utils/subgraph";

async function querySubgraphRaw(accountAddress: string): Promise<void> {
  const url = process.env.SUBGRAPH_QUERY_URL?.trim();
  if (!url) {
    console.log("Skipping subgraph raw dump: SUBGRAPH_QUERY_URL is not set.");
    return;
  }

  const query = `
    query Snapshot($account: Bytes!) {
      policyRules(where: { account: $account }, first: 20, orderBy: updatedAtBlock, orderDirection: desc) {
        id
        ruleId
        target
        selector
        active
        spendParamIndex
        maxPerPeriod
        periodDuration
        updatedAtBlock
        updatedTxHash
      }
      executionEnvelopes(where: { account: $account }, first: 10, orderBy: blockNumber, orderDirection: desc) {
        id
        nonce
        policyChecked
        blockNumber
        signer
        txHash
      }
      executionCalls(where: { account: $account }, first: 10, orderBy: blockNumber, orderDirection: desc) {
        id
        target
        selector
        nonce
        blockNumber
        txHash
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { account: accountAddress.toLowerCase() } }),
  });
  const json = await res.json();
  console.log("\n--- Raw subgraph snapshot (after positive transfer) ---");
  console.log(JSON.stringify(json, null, 2));
}

async function main() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const ctx = await getContext();
  const allowedDestination = process.env.ALLOWED_DESTINATION_ADDRESS?.trim() || ctx.recipientAddress;
  if (!ethers.isAddress(allowedDestination)) {
    throw new Error(`Invalid ALLOWED_DESTINATION_ADDRESS/RECIPIENT_ADDRESS: ${allowedDestination}`);
  }

  const transferCall = ctx.mockToken.interface.encodeFunctionData("transfer", [
    allowedDestination,
    ctx.tokenAmount,
  ]);
  const executionCalldata = encodeSingle(ctx.mockTokenAddress, 0n, transferCall);

  const accountTokenBalanceBefore = await ctx.mockToken.balanceOf(ctx.accountAddress);
  if (accountTokenBalanceBefore < ctx.tokenAmount) {
    throw new Error(
      `Account token balance ${accountTokenBalanceBefore} is below TOKEN_AMOUNT ${ctx.tokenAmount}.`
    );
  }

  const recipientBefore = await ctx.mockToken.balanceOf(allowedDestination);
  const nonce = await ctx.account.nonce();
  const sig = await signExecuteAuthorized(
    ctx.agentWallet,
    ctx.accountAddress,
    MODE_SINGLE,
    executionCalldata,
    nonce
  );

  const tx = await ctx.account
    .connect(ctx.agentWallet)
    .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig, { gasLimit: 900000 });
  await tx.wait();
  console.log(`Positive transfer tx: ${tx.hash}`);

  const recipientAfter = await ctx.mockToken.balanceOf(allowedDestination);
  const delta = recipientAfter - recipientBefore;
  console.log(`Allowed destination token balance delta: ${delta}`);
  if (delta < ctx.tokenAmount) {
    throw new Error(`Transfer expected >= ${ctx.tokenAmount} tokens but got ${delta}`);
  }

  await waitForSubgraphIndexingMs();
  await querySubgraphRaw(ctx.accountAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
