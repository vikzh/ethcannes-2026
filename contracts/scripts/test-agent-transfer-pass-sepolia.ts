import { ethers } from "hardhat";
import { getContext, MODE_SINGLE, encodeSingle, signExecuteAuthorized } from "./utils/agent-flow";

async function main() {
  const ctx = await getContext();
  const autoFund = (process.env.AUTO_FUND_ACCOUNT || "true").toLowerCase() === "true";
  const accountBalance = await ethers.provider.getBalance(ctx.accountAddress);

  if (accountBalance < ctx.transferWei) {
    if (!autoFund) {
      throw new Error(
        `Account balance ${accountBalance} is below transfer amount ${ctx.transferWei}. Set AUTO_FUND_ACCOUNT=true.`
      );
    }

    const topup = ctx.transferWei - accountBalance + ethers.parseEther("0.00005");
    console.log(`Funding account ${ctx.accountAddress} with ${topup} wei...`);
    const fundTx = await ctx.owner.sendTransaction({
      to: ctx.accountAddress,
      value: topup,
    });
    await fundTx.wait();
  }

  const before = await ethers.provider.getBalance(ctx.recipientAddress);
  const nonce = await ctx.account.nonce();
  const executionCalldata = encodeSingle(ctx.recipientAddress, ctx.transferWei, "0x");
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
  console.log(`Transfer tx: ${tx.hash}`);

  const after = await ethers.provider.getBalance(ctx.recipientAddress);
  const delta = after - before;
  console.log(`Recipient balance delta: ${delta} wei`);
  if (delta < ctx.transferWei) {
    throw new Error(`Transfer expected >= ${ctx.transferWei} wei but got ${delta} wei`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
