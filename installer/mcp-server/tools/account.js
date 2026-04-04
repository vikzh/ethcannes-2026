import { z } from "zod";
import {
  formatEther,
  formatUnits,
  encodeFunctionData,
  serializeTransaction,
  isAddress,
  getAddress,
} from "viem";
import { getPublicClient } from "../lib/rpc.js";
import { ISOLATED_ACCOUNT_ABI } from "../lib/abi/isolated-account.js";
import { POLICY_HOOK_ABI } from "../lib/abi/policy-hook.js";
import { AGENT_SESSION_ABI } from "../lib/abi/agent-session.js";
import { WHITELIST_REQUEST_ABI, REQUEST_STATUS } from "../lib/abi/whitelist-request.js";
import { ACTIVE_CHAIN_ID, RPC_URL, explorerAddressUrl, explorerTxUrl } from "../lib/constants.js";

const SELECTOR_HEX = /^0x[0-9a-fA-F]{8}$/;
const MIN_REASON_LEN = 20;

/** Compact on-chain metadata: three lines for owner review. */
function buildWhitelistRequestMetadata({ business_reason, contract, selector }) {
  return [
    `business_reason: ${business_reason.trim()}`,
    `contract: ${contract}`,
    `selector: ${selector}`,
  ].join("\n");
}

const WHITELIST_MODULE_ABI = [
  { name: "whitelistModule", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

export function registerAccountTools(server, { owsExec, readApiKey, walletName, agentAddress, aaAccount } = {}) {
  const accountAddress = aaAccount;
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

  // --- Whitelist request tools (agent-native path, no executeAuthorized needed) ---

  if (!owsExec) return;

  const ISOLATED_ACCOUNT_WHITELIST_ABI = [
    {
      name: "requestWhitelistAdditionAsAgent",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "target", type: "address" },
        { name: "selector", type: "bytes4" },
        { name: "metadata", type: "string" },
      ],
      outputs: [{ name: "requestId", type: "uint256" }],
    },
    {
      name: "cancelWhitelistRequestAsAgent",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ name: "requestId", type: "uint256" }],
      outputs: [],
    },
  ];

  function chainName(id) {
    const names = { 8453: "base", 1: "ethereum", 42161: "arbitrum", 10: "optimism", 137: "polygon" };
    return names[id] || `eip155:${id}`;
  }

  async function broadcastAgentTx(to, data) {
    const client = getPublicClient();
    const apiKey = await readApiKey();

    const nonce = await client.getTransactionCount({ address: agentAddress, blockTag: "pending" });
    let gasEstimate;
    try {
      gasEstimate = await client.estimateGas({ account: agentAddress, to, data, value: 0n, nonce });
    } catch {
      gasEstimate = 300_000n;
    }
    const gas = (gasEstimate * 130n) / 100n;
    const feeData = await client.estimateFeesPerGas();

    const unsignedTx = {
      to, data, value: 0n, nonce, gas,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
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

    return { txHash, status, blockNumber, rawOutput: result };
  }

  server.tool(
    "account_request_whitelist",
    "Submit a whitelist request for (contract, selector). On-chain metadata is exactly three lines: business_reason, contract address, selector. Calls requestWhitelistAdditionAsAgent on the IsolatedAccount; the owner must approve.",
    {
      business_reason: z
        .string()
        .transform((s) => s.trim())
        .pipe(
          z
            .string()
            .min(MIN_REASON_LEN)
            .describe(
              "One concise business justification, e.g. why this call is needed (protocol, asset, pool/fee if relevant)",
            ),
        ),
      contract: z
        .string()
        .transform((s) => s.trim())
        .refine((s) => isAddress(s, { strict: false }), {
          message: "contract must be a valid EVM address",
        })
        .transform((s) => getAddress(s))
        .describe("Target contract to whitelist, e.g. SwapRouter02 or token"),
      selector: z
        .string()
        .transform((s) => s.trim())
        .refine((s) => SELECTOR_HEX.test(s), {
          message: "selector must be 4-byte hex, e.g. 0x04e45aaf or 0xffffffff for wildcard",
        })
        .describe("Function selector (bytes4), e.g. 0x04e45aaf. Use 0xffffffff for wildcard"),
    },
    async ({ business_reason, contract: contractAddr, selector: sel }) => {
      try {
        const metadata = buildWhitelistRequestMetadata({
          business_reason,
          contract: contractAddr,
          selector: sel,
        });

        const calldata = encodeFunctionData({
          abi: ISOLATED_ACCOUNT_WHITELIST_ABI,
          functionName: "requestWhitelistAdditionAsAgent",
          args: [contractAddr, sel, metadata],
        });

        const { txHash, status, blockNumber } = await broadcastAgentTx(accountAddress, calldata);

        const lines = [
          `Whitelist Request Submitted`,
          `  Metadata:`,
          ...metadata.split("\n").map((line) => `    ${line}`),
          `  IsolatedAccount: ${accountAddress}`,
          ``,
          `  Tx Hash: ${txHash || "(unknown)"}`,
          `  Status: ${status}`,
        ];
        if (blockNumber) lines.push(`  Block: ${blockNumber}`);
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
    "Cancel a pending whitelist request that the agent previously submitted. Calls cancelWhitelistRequestAsAgent directly on the IsolatedAccount.",
    {
      requestId: z.number().describe("The request ID to cancel"),
    },
    async ({ requestId }) => {
      try {
        const calldata = encodeFunctionData({
          abi: ISOLATED_ACCOUNT_WHITELIST_ABI,
          functionName: "cancelWhitelistRequestAsAgent",
          args: [BigInt(requestId)],
        });

        const { txHash, status, blockNumber } = await broadcastAgentTx(accountAddress, calldata);

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

  async function resolveWhitelistModule() {
    const client = getPublicClient();
    const addr = await client.readContract({
      address: accountAddress,
      abi: WHITELIST_MODULE_ABI,
      functionName: "whitelistModule",
    });
    if (!addr || addr === "0x0000000000000000000000000000000000000000") {
      throw new Error("No WhitelistRequestModule configured on this account");
    }
    return addr;
  }

  server.tool(
    "account_get_pending_requests",
    "List all pending whitelist requests for this account.",
    {},
    async () => {
      const client = getPublicClient();

      const moduleAddr = await resolveWhitelistModule();
      const pending = await client.readContract({
        address: moduleAddr,
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
        const moduleAddr = await resolveWhitelistModule();
        const req = await client.readContract({
          address: moduleAddr,
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
