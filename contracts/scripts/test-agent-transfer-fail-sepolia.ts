import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const nonce = await ctx.account.nonce();
  const executionCalldata = encodeSingle(ctx.recipientAddress, ctx.transferWei, "0x");
  const sig = await signExecuteAuthorized(
    ctx.agentWallet,
    ctx.accountAddress,
    MODE_SINGLE,
    executionCalldata,
    nonce
  );

  console.log("Submitting transfer before whitelist approval (expected to fail)...");

  try {
    const tx = await ctx.account
      .connect(ctx.agentWallet)
      .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig, { gasLimit: 800000 });
    await tx.wait();
    throw new Error("Transfer unexpectedly succeeded before whitelist approval.");
  } catch (err: any) {
    const message = String(err?.message || err);
    const maybeData = err?.data || err?.error?.data || err?.info?.error?.data;
    if (maybeData) {
      try {
        const decoded = ctx.account.interface.parseError(maybeData);
        if (decoded) {
          console.log(`Reverted with account error: ${decoded.name}`);
        }
      } catch {}
    }
    if (message.toLowerCase().includes("revert")) {
      console.log("Success: transfer reverted before whitelist approval as expected.");
      return;
    }
    throw err;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
