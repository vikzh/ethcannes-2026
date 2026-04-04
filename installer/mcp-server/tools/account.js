import { z } from "zod";
import { formatEther, formatUnits, encodeFunctionData, serializeTransaction, parseGwei } from "viem";
import { getPublicClient } from "../lib/rpc.js";
import { ISOLATED_ACCOUNT_ABI } from "../lib/abi/isolated-account.js";
import { POLICY_HOOK_ABI } from "../lib/abi/policy-hook.js";
import { AGENT_SESSION_ABI } from "../lib/abi/agent-session.js";
import { WHITELIST_REQUEST_ABI, REQUEST_STATUS } from "../lib/abi/whitelist-request.js";
import { buildAATransaction } from "../lib/aa.js";
import { AA_ACCOUNT, ACTIVE_CHAIN_ID, RPC_URL, explorerAddressUrl, explorerTxUrl } from "../lib/constants.js";

export function registerAccountTools(server, { owsExec, readApiKey, walletName, agentAddress } = {}) {
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

  // --- Whitelist request tools ---

  const whitelistModuleAddr = process.env.WHITELIST_REQUEST_MODULE || "";
  if (!whitelistModuleAddr || !owsExec) return;

  function chainName(id) {
    const names = { 8453: "base", 1: "ethereum", 42161: "arbitrum", 10: "optimism", 137: "polygon" };
    return names[id] || `eip155:${id}`;
  }

  async function broadcastViaMCP(innerTo, innerData, innerValue = "0") {
    const client = getPublicClient();
    const apiKey = await readApiKey();

    let outerTo = innerTo;
    let outerData = innerData;
    let outerValue = innerValue;
    let aaNonce;

    if (accountAddress) {
      const aaResult = await buildAATransaction({
        publicClient: client,
        owsExec,
        readApiKey,
        walletName,
        accountAddress,
        chainId: ACTIVE_CHAIN_ID,
        calls: [{ target: innerTo, value: innerValue, data: innerData }],
      });
      outerTo = aaResult.outerTo;
      outerData = aaResult.outerData;
      outerValue = aaResult.outerValue;
      aaNonce = aaResult.accountNonce;
    }

    const nonce = await client.getTransactionCount({ address: agentAddress, blockTag: "pending" });
    let gasEstimate;
    try {
      gasEstimate = await client.estimateGas({ account: agentAddress, to: outerTo, data: outerData, value: BigInt(outerValue), nonce });
    } catch {
      gasEstimate = 500_000n;
    }
    const gas = (gasEstimate * 130n) / 100n;
    const feeData = await client.estimateFeesPerGas();

    const unsignedTx = {
      to: outerTo, data: outerData, value: BigInt(outerValue),
      nonce, gas, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: ACTIVE_CHAIN_ID, type: "eip1559",
    };

    const serializedUnsigned = serializeTransaction(unsignedTx);
    const txHex = serializedUnsigned.startsWith("0x") ? serializedUnsigned.slice(2) : serializedUnsigned;

    const sendArgs = ["sign", "send-tx", "--chain", chainName(ACTIVE_CHAIN_ID), "--wallet", walletName, "--tx", txHex, "--json"];
    if (RPC_URL) sendArgs.push("--rpc-url", RPC_URL);

    const result = await owsExec(sendArgs, apiKey);

    let txHash;
    try {
      const parsed = JSON.parse(result);
      txHash = parsed.hash || parsed.tx_hash || parsed.txHash || parsed.transaction_hash;
    } catch {
      const hashMatch = result.match(/0x[0-9a-fA-F]{64}/);
      txHash = hashMatch ? hashMatch[0] : null;
    }

    let status = "pending";
    let blockNumber;
    if (txHash) {
      try {
        const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
        status = receipt.status === "success" ? "confirmed" : "reverted";
        blockNumber = receipt.blockNumber;
      } catch {}
    }

    return { txHash, status, blockNumber, aaNonce, rawOutput: result };
  }

  server.tool(
    "account_request_whitelist",
    "Submit an on-chain request to whitelist a (target, selector) pair so the agent can interact with a new contract/function. The owner must approve the request before it takes effect. Broadcasts the tx directly.",
    {
      target: z.string().describe("Contract address to whitelist"),
      selector: z.string().describe("Function selector (4-byte hex, e.g. '0xa9059cbb' for transfer). Use '0xffffffff' for wildcard (all functions)"),
      metadata: z.string().describe("Justification for the request (e.g. 'Uniswap V3 Router - exactInputSingle swap')"),
    },
    async ({ target, selector, metadata }) => {
      try {
        const calldata = encodeFunctionData({
          abi: WHITELIST_REQUEST_ABI,
          functionName: "requestWhitelistAddition",
          args: [target, selector, metadata],
        });

        const { txHash, status, blockNumber, aaNonce } = await broadcastViaMCP(whitelistModuleAddr, calldata, "0");

        const lines = [
          `Whitelist Request Submitted`,
          `  Target: ${target}`,
          `  Selector: ${selector}`,
          `  Metadata: ${metadata}`,
          `  Module: ${whitelistModuleAddr}`,
          ``,
          `  Tx Hash: ${txHash || "(unknown)"}`,
          `  Status: ${status}`,
        ];
        if (blockNumber) lines.push(`  Block: ${blockNumber}`);
        if (aaNonce !== undefined) lines.push(`  AA Nonce: ${aaNonce.toString()}`);
        if (txHash) lines.push(`  Explorer: ${explorerTxUrl(txHash)}`);
        lines.push(``);
        lines.push(`The request is now pending on-chain. The account owner must approve it.`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Whitelist request failed: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "account_cancel_whitelist_request",
    "Cancel a pending whitelist request that the agent previously submitted. Broadcasts the tx directly.",
    {
      requestId: z.number().describe("The request ID to cancel"),
    },
    async ({ requestId }) => {
      try {
        const calldata = encodeFunctionData({
          abi: WHITELIST_REQUEST_ABI,
          functionName: "cancelRequest",
          args: [BigInt(requestId)],
        });

        const { txHash, status, blockNumber } = await broadcastViaMCP(whitelistModuleAddr, calldata, "0");

        const lines = [
          `Whitelist Request #${requestId} — Cancellation`,
          `  Tx Hash: ${txHash || "(unknown)"}`,
          `  Status: ${status}`,
        ];
        if (blockNumber) lines.push(`  Block: ${blockNumber}`);
        if (txHash) lines.push(`  Explorer: ${explorerTxUrl(txHash)}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Cancel request failed: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "account_get_pending_requests",
    "List all pending whitelist requests for this account.",
    {},
    async () => {
      const client = getPublicClient();

      const pending = await client.readContract({
        address: whitelistModuleAddr,
        abi: WHITELIST_REQUEST_ABI,
        functionName: "getPendingRequests",
        args: [accountAddress],
      });

      if (pending.length === 0) {
        return { content: [{ type: "text", text: "No pending whitelist requests." }] };
      }

      const lines = [`Pending whitelist requests (${pending.length}):`];
      for (const req of pending) {
        lines.push(``);
        lines.push(`  Request #${req.requestId.toString()}`);
        lines.push(`    Target: ${req.target}`);
        lines.push(`    Selector: ${req.selector}`);
        lines.push(`    Metadata: ${req.metadata}`);
        lines.push(`    Status: ${REQUEST_STATUS[req.status] || req.status}`);
        lines.push(`    Created: ${new Date(Number(req.createdAt) * 1000).toISOString()}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "account_get_whitelist_request",
    "Get details of a specific whitelist request by ID.",
    {
      requestId: z.number().describe("The request ID to look up"),
    },
    async ({ requestId }) => {
      const client = getPublicClient();

      try {
        const req = await client.readContract({
          address: whitelistModuleAddr,
          abi: WHITELIST_REQUEST_ABI,
          functionName: "getRequest",
          args: [accountAddress, BigInt(requestId)],
        });

        const text = [
          `Whitelist Request #${req.requestId.toString()}`,
          `  Target: ${req.target}`,
          `  Selector: ${req.selector}`,
          `  Metadata: ${req.metadata}`,
          `  Status: ${REQUEST_STATUS[req.status] || req.status}`,
          `  Created: ${new Date(Number(req.createdAt) * 1000).toISOString()}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Request not found: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
