import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const transferCall = ctx.mockToken.interface.encodeFunctionData("transfer", [
    ctx.recipientAddress,
    ctx.tokenAmount,
  ]);
  const executionCalldata = encodeSingle(ctx.mockTokenAddress, 0n, transferCall);

  const accountTokenBalanceBefore = await ctx.mockToken.balanceOf(ctx.accountAddress);
  if (accountTokenBalanceBefore < ctx.tokenAmount) {
    throw new Error(
      `Account token balance ${accountTokenBalanceBefore} is below TOKEN_AMOUNT ${ctx.tokenAmount}.`
    );
  }

  const recipientBefore = await ctx.mockToken.balanceOf(ctx.recipientAddress);
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
    .executeAuthorized(MODE_SINGLE, executionCalldata, nonce, 0n, sig);
  await tx.wait();
  console.log(`ERC20 transfer tx: ${tx.hash}`);

  const recipientAfter = await ctx.mockToken.balanceOf(ctx.recipientAddress);
  const delta = recipientAfter - recipientBefore;
  console.log(`Recipient token balance delta: ${delta}`);
  if (delta < ctx.tokenAmount) {
    throw new Error(`Transfer expected >= ${ctx.tokenAmount} tokens but got ${delta}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
