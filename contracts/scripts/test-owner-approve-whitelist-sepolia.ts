import { getContext, MODE_SINGLE, NATIVE_TRANSFER_SELECTOR, encodeSingle } from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const requestId = BigInt(process.env.REQUEST_ID || "0");

  const approveCall = ctx.whitelistModule.interface.encodeFunctionData("approveRequest", [
    requestId,
    await ctx.policyHook.getAddress(),
  ]);
  const tx = await ctx.account.execute(
    MODE_SINGLE,
    encodeSingle(await ctx.whitelistModule.getAddress(), 0n, approveCall)
  );
  await tx.wait();
  console.log(`Approve request tx: ${tx.hash}`);

  const isWhitelisted = await ctx.policyHook.isWhitelisted(
    ctx.accountAddress,
    ctx.recipientAddress,
    NATIVE_TRANSFER_SELECTOR
  );
  console.log(`Recipient whitelist status: ${isWhitelisted}`);
  if (!isWhitelisted) {
    throw new Error("Approval tx mined but recipient selector is still not whitelisted.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
