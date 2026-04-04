import { z } from "zod";
import { formatEther, formatUnits } from "viem";
import { getPublicClient } from "../lib/rpc.js";
import { ISOLATED_ACCOUNT_ABI } from "../lib/abi/isolated-account.js";
import { POLICY_HOOK_ABI } from "../lib/abi/policy-hook.js";
import { AGENT_SESSION_ABI } from "../lib/abi/agent-session.js";
import { AA_ACCOUNT, explorerAddressUrl } from "../lib/constants.js";

export function registerAccountTools(server) {
  const accountAddress = AA_ACCOUNT;
  if (!accountAddress) return;

  server.tool(
    "account_info",
    "Get the IsolatedAccount smart account state: owner, modules, nonce, ETH balance, policy config, and agent session status.",
    {},
    async () => {
      const client = getPublicClient();

      const [owner, policyHookAddr, sessionValidatorAddr, accountNonce, balance] = await Promise.all([
        client.readContract({ address: accountAddress, abi: ISOLATED_ACCOUNT_ABI, functionName: "owner" }),
        client.readContract({ address: accountAddress, abi: ISOLATED_ACCOUNT_ABI, functionName: "policyHook" }),
        client.readContract({ address: accountAddress, abi: ISOLATED_ACCOUNT_ABI, functionName: "agentSessionValidator" }),
        client.readContract({ address: accountAddress, abi: ISOLATED_ACCOUNT_ABI, functionName: "nonce" }),
        client.getBalance({ address: accountAddress }),
      ]);

      const lines = [
        `IsolatedAccount: ${accountAddress}`,
        `  ${explorerAddressUrl(accountAddress)}`,
        `  Owner: ${owner}`,
        `  PolicyHook: ${policyHookAddr || "(none)"}`,
        `  AgentSessionValidator: ${sessionValidatorAddr || "(none)"}`,
        `  Account Nonce: ${accountNonce.toString()}`,
        `  ETH Balance: ${formatEther(balance)} ETH`,
      ];

      if (policyHookAddr && policyHookAddr !== "0x0000000000000000000000000000000000000000") {
        try {
          const policy = await client.readContract({
            address: policyHookAddr,
            abi: POLICY_HOOK_ABI,
            functionName: "getPolicy",
            args: [accountAddress],
          });
          lines.push(``);
          lines.push(`  Policy:`);
          lines.push(`    Paused: ${policy.paused}`);
          lines.push(`    Native value cap/tx: ${policy.nativeValueCapPerTx === 0n ? "no cap" : formatEther(policy.nativeValueCapPerTx) + " ETH"}`);
        } catch {}
      }

      if (sessionValidatorAddr && sessionValidatorAddr !== "0x0000000000000000000000000000000000000000") {
        try {
          const session = await client.readContract({
            address: sessionValidatorAddr,
            abi: AGENT_SESSION_ABI,
            functionName: "getSession",
            args: [accountAddress],
          });
          lines.push(``);
          lines.push(`  Agent Session:`);
          lines.push(`    Agent Key: ${session.agentKey}`);
          lines.push(`    Valid After: ${session.validAfter === 0 ? "immediate" : new Date(Number(session.validAfter) * 1000).toISOString()}`);
          lines.push(`    Valid Until: ${session.validUntil === 0 ? "no expiry" : new Date(Number(session.validUntil) * 1000).toISOString()}`);
          lines.push(`    Session Nonce: ${session.nonce.toString()}`);
          lines.push(`    Revoked: ${session.revoked}`);
        } catch {}
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "account_check_whitelist",
    "Check if a (target, selector) pair is whitelisted for this IsolatedAccount in the PolicyHook. Use selector '0xffffffff' to check wildcard.",
    {
      target: z.string().describe("Target contract address"),
      selector: z.string().describe("Function selector (4-byte hex, e.g. '0xa9059cbb' for transfer). Use '0xffffffff' for wildcard"),
    },
    async ({ target, selector }) => {
      const client = getPublicClient();

      const policyHookAddr = await client.readContract({
        address: accountAddress,
        abi: ISOLATED_ACCOUNT_ABI,
        functionName: "policyHook",
      });

      if (!policyHookAddr || policyHookAddr === "0x0000000000000000000000000000000000000000") {
        return {
          content: [{ type: "text", text: "No PolicyHook is set on this account. All calls are allowed." }],
        };
      }

      const allowed = await client.readContract({
        address: policyHookAddr,
        abi: POLICY_HOOK_ABI,
        functionName: "isWhitelisted",
        args: [accountAddress, target, selector],
      });

      const text = [
        `Whitelist check for ${accountAddress}`,
        `  Target: ${target}`,
        `  Selector: ${selector}`,
        `  Allowed: ${allowed}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "account_get_spend_limit",
    "Read the spend limit for a specific ERC-20 token on this IsolatedAccount.",
    {
      token: z.string().describe("ERC-20 token address"),
      decimals: z
        .number()
        .default(18)
        .describe("Token decimals for display formatting. Default: 18"),
    },
    async ({ token, decimals }) => {
      const client = getPublicClient();

      const policyHookAddr = await client.readContract({
        address: accountAddress,
        abi: ISOLATED_ACCOUNT_ABI,
        functionName: "policyHook",
      });

      if (!policyHookAddr || policyHookAddr === "0x0000000000000000000000000000000000000000") {
        return {
          content: [{ type: "text", text: "No PolicyHook is set on this account. No spend limits." }],
        };
      }

      const sl = await client.readContract({
        address: policyHookAddr,
        abi: POLICY_HOOK_ABI,
        functionName: "getSpendLimit",
        args: [accountAddress, token],
      });

      if (sl.maxPerPeriod === 0n) {
        return {
          content: [{ type: "text", text: `No spend limit configured for token ${token} on this account.` }],
        };
      }

      const periodHours = Number(sl.periodDuration) / 3600;
      const remaining = sl.maxPerPeriod - sl.spentInPeriod;

      const text = [
        `Spend limit for ${token}`,
        `  Max per period: ${formatUnits(sl.maxPerPeriod, decimals)}`,
        `  Period duration: ${periodHours}h`,
        `  Spent this period: ${formatUnits(sl.spentInPeriod, decimals)}`,
        `  Remaining: ${formatUnits(remaining, decimals)}`,
        `  Period start: ${new Date(Number(sl.periodStart) * 1000).toISOString()}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "account_get_policy",
    "Read the full PolicyConfig for this IsolatedAccount: pause state and native value cap.",
    {},
    async () => {
      const client = getPublicClient();

      const policyHookAddr = await client.readContract({
        address: accountAddress,
        abi: ISOLATED_ACCOUNT_ABI,
        functionName: "policyHook",
      });

      if (!policyHookAddr || policyHookAddr === "0x0000000000000000000000000000000000000000") {
        return {
          content: [{ type: "text", text: "No PolicyHook is set on this account." }],
        };
      }

      const policy = await client.readContract({
        address: policyHookAddr,
        abi: POLICY_HOOK_ABI,
        functionName: "getPolicy",
        args: [accountAddress],
      });

      const text = [
        `Policy for ${accountAddress}`,
        `  PolicyHook: ${policyHookAddr}`,
        `  Paused: ${policy.paused}`,
        `  Native value cap per tx: ${policy.nativeValueCapPerTx === 0n ? "no cap" : formatEther(policy.nativeValueCapPerTx) + " ETH"}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );
}
