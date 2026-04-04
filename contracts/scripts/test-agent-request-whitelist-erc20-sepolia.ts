import {
  getContext,
  MODE_SINGLE,
  encodeSingle,
  signExecuteAuthorized,
  maybeQuerySubgraph,
} from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const transferSelector = ctx.mockToken.interface.getFunction("transfer")!.selector;
  const requestSelector = ctx.whitelistModule.interface.getFunction("requestWhitelistAddition")!.selector;

  const isRequestWhitelisted = await ctx.policyHook.isWhitelisted(
    ctx.accountAddress,
    await ctx.whitelistModule.getAddress(),
    requestSelector
  );

  if (!isRequestWhitelisted) {
    console.log("Whitelisting requestWhitelistAddition on WhitelistRequestModule...");
    const callData = ctx.policyHook.interface.encodeFunctionData("addWhitelistEntry", [
      await ctx.whitelistModule.getAddress(),
      requestSelector,
    ]);
    const tx = await ctx.account.execute(
      MODE_SINGLE,
      encodeSingle(await ctx.policyHook.getAddress(), 0n, callData)
    );
    await tx.wait();
  }

  const requestCall = ctx.whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
    ctx.mockTokenAddress,
    transferSelector,
    "erc20 transfer approval for testing",
  ]);
  const requestExec = encodeSingle(await ctx.whitelistModule.getAddress(), 0n, requestCall);
  const nonce = await ctx.account.nonce();
  const sig = await signExecuteAuthorized(
    ctx.agentWallet,
    ctx.accountAddress,
    MODE_SINGLE,
    requestExec,
    nonce
  );

  const tx = await ctx.account
    .connect(ctx.agentWallet)
    .executeAuthorized(MODE_SINGLE, requestExec, nonce, 0n, sig);
  await tx.wait();
  console.log(`Whitelist request tx: ${tx.hash}`);

  const pending = await ctx.whitelistModule.getPendingRequests(ctx.accountAddress);
  console.log(`Pending requests count: ${pending.length}`);
  if (pending.length > 0) {
    const r = pending[pending.length - 1];
    console.log(`Latest pending requestId: ${r.requestId.toString()} target=${r.target} selector=${r.selector}`);
  }

  await maybeQuerySubgraph(ctx.accountAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
