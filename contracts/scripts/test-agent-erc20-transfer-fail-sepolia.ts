import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const transferCall = ctx.mockToken.interface.encodeFunctionData("transfer", [
    ctx.recipientAddress,
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

  console.log("Submitting ERC20 transfer before whitelist approval (expected to fail)...");

  try {
    const tx = await ctx.account
      .connect(ctx.agentWallet)
      .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig, { gasLimit: 900000 });
    await tx.wait();
    throw new Error("ERC20 transfer unexpectedly succeeded before whitelist approval.");
  } catch (err: any) {
    const message = String(err?.message || err);
    if (message.toLowerCase().includes("revert")) {
      console.log("Success: ERC20 transfer reverted before whitelist approval as expected.");
      return;
    }
    throw err;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
