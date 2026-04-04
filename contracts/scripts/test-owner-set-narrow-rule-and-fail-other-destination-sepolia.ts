import { ethers, network } from "hardhat";
import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";
import { waitForSubgraphIndexingMs } from "./utils/subgraph";

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

async function querySubgraphRules(accountAddress: string): Promise<void> {
  const url = process.env.SUBGRAPH_QUERY_URL?.trim();
  if (!url) {
    console.log("Skipping subgraph raw dump: SUBGRAPH_QUERY_URL is not set.");
    return;
  }

  const q = `
    query Rules($account: Bytes!) {
      account(id: $account) {
        id
        owner
        policyHook
      }
      policyRules(where: { account: $account }, first: 50, orderBy: updatedAtBlock, orderDirection: desc) {
        id
        account
        ruleId
        target
        selector
        active
        spendParamIndex
        maxPerPeriod
        periodDuration
        addedAtBlock
        updatedAtBlock
        updatedTxHash
      }
      whitelistEntries(where: { account: $account }, first: 50, orderBy: updatedAtBlock, orderDirection: desc) {
        id
        account
        target
        selector
        active
        addedAtBlock
        updatedAtBlock
        updatedTxHash
      }
      executionEnvelopes(
        where: { account: $account }
        first: 10
        orderBy: blockNumber
        orderDirection: desc
      ) {
        id
        nonce
        policyChecked
        blockNumber
        signer
        txHash
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: q,
      variables: { account: accountAddress.toLowerCase() },
    }),
  });
  const json = await res.json();
  console.log("\n--- Raw subgraph rules snapshot ---");
  console.log(JSON.stringify(json, null, 2));
}

async function main() {
  if (network.name !== "sepolia") {
    throw new Error(`This script is intended for sepolia, got: ${network.name}`);
  }

  const allowedDestination = requireEnv("ALLOWED_DESTINATION_ADDRESS");
  if (!ethers.isAddress(allowedDestination)) {
    throw new Error(`Invalid ALLOWED_DESTINATION_ADDRESS: ${allowedDestination}`);
  }

  const ctx = await getContext();
  const transferSelector = ctx.mockToken.interface.getFunction("transfer")!.selector;
  const hookAddress = await ctx.policyHook.getAddress();
  const tokenAmountDailyLimit = ethers.parseUnits("10", await ctx.mockToken.decimals());
  const spendPeriodSeconds = 24 * 60 * 60;

  const broadAllowed = await ctx.policyHook.isWhitelisted(
    ctx.accountAddress,
    ctx.mockTokenAddress,
    transferSelector
  );

  if (broadAllowed) {
    const removeCall = ctx.policyHook.interface.encodeFunctionData("removeWhitelistEntry", [
      ctx.mockTokenAddress,
      transferSelector,
    ]);
    const tx = await ctx.account.execute(MODE_SINGLE, encodeSingle(hookAddress, 0n, removeCall));
    await tx.wait();
    console.log(`Removed broad whitelist entry for token transfer. tx=${tx.hash}`);
  } else {
    console.log("Broad whitelist entry for token transfer already absent.");
  }

  const condition = {
    paramIndex: 0,
    expectedValue: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [allowedDestination]),
  };
  const conditions = [condition];
  const ruleId = await ctx.policyHook.computeEqRuleId(ctx.mockTokenAddress, transferSelector, conditions);
  const existingRule = await ctx.policyHook.getEqRule(ctx.accountAddress, ruleId);

  if (!existingRule[0].active) {
    const addRuleCall = ctx.policyHook.interface.encodeFunctionData("addEqRuleWithSpend", [
      ctx.mockTokenAddress,
      transferSelector,
      conditions,
      {
        spendParamIndex: 1,
        maxPerPeriod: tokenAmountDailyLimit,
        periodDuration: spendPeriodSeconds,
      },
    ]);
    const tx = await ctx.account.execute(MODE_SINGLE, encodeSingle(hookAddress, 0n, addRuleCall));
    await tx.wait();
    console.log(
      `Added narrow rule. ruleId=${ruleId} allowedDestination=${allowedDestination} limit=${tokenAmountDailyLimit} per ${spendPeriodSeconds}s tx=${tx.hash}`
    );
  } else {
    console.log(`Narrow rule already active. ruleId=${ruleId}`);
  }

  await waitForSubgraphIndexingMs();
  await querySubgraphRules(ctx.accountAddress);

  const disallowedRecipient = process.env.DISALLOWED_RECIPIENT_ADDRESS?.trim() || ctx.recipientAddress;
  if (!ethers.isAddress(disallowedRecipient)) {
    throw new Error(`Invalid DISALLOWED_RECIPIENT_ADDRESS: ${disallowedRecipient}`);
  }
  if (disallowedRecipient.toLowerCase() === allowedDestination.toLowerCase()) {
    throw new Error("DISALLOWED_RECIPIENT_ADDRESS must be different from ALLOWED_DESTINATION_ADDRESS");
  }

  const transferCall = ctx.mockToken.interface.encodeFunctionData("transfer", [
    disallowedRecipient,
    ctx.tokenAmount,
  ]);
  const executionCalldata = encodeSingle(ctx.mockTokenAddress, 0n, transferCall);
  const nonce = await ctx.account.nonce();
  const sig = await signExecuteAuthorized(
    ctx.agentWallet,
    ctx.accountAddress,
    MODE_SINGLE,
    executionCalldata,
    nonce
  );

  console.log(
    `Attempting agent transfer to disallowed destination ${disallowedRecipient} (should revert)...`
  );
  try {
    const tx = await ctx.account
      .connect(ctx.agentWallet)
      .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig, { gasLimit: 900000 });
    await tx.wait();
    throw new Error("Unexpected success: transfer to disallowed destination was executed.");
  } catch (err) {
    if (!isExpectedRevert(err)) throw err;
    console.log("Transfer reverted as expected for disallowed destination.");
  }

  await waitForSubgraphIndexingMs();
  await querySubgraphRules(ctx.accountAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
