#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { registerUniswapTools } from "./tools/uniswap.js";
import { registerAaveTools } from "./tools/aave.js";
import { registerBalanceTools } from "./tools/balance.js";
import { registerTokenTools } from "./tools/token.js";
import { registerContractTools } from "./tools/contract.js";
import { registerTransactionTools } from "./tools/transaction.js";
import { registerAccountTools } from "./tools/account.js";
import { getPublicClient } from "./lib/rpc.js";
import { PROTOCOLS, TOKENS, FACTORY_ADDRESS, ACTIVE_CHAIN_ID, explorerAddressUrl } from "./lib/constants.js";

const WALLET_NAME = process.env.AGENT_WALLET_NAME || "agent-wallet";
const KEY_FILE = join(homedir(), ".ows", `${WALLET_NAME}.key`);

const FACTORY_ABI = [
  { name: "getWalletByAgent", type: "function", stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "address" }] },
];

async function readApiKey() {
  try {
    const key = await readFile(KEY_FILE, "utf-8");
    return key.trim();
  } catch {
    throw new Error(
      `API key file not found at ${KEY_FILE}. Run the installer first.`
    );
  }
}

function owsExec(args, apiKey) {
  return new Promise((resolve, reject) => {
    execFile("ows", args, {
      env: { ...process.env, OWS_PASSPHRASE: apiKey },
      timeout: 30000,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`OWS error: ${stderr || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function resolveWalletAddress() {
  try {
    const apiKey = await readApiKey();
    const output = await owsExec(["wallet", "list"], apiKey);
    const match = output.match(/0x[0-9a-fA-F]{40}/);
    return match ? match[0] : "unknown";
  } catch {
    return "unknown (run installer first)";
  }
}

async function resolveAAAccount(agentAddr) {
  if (!FACTORY_ADDRESS || agentAddr === "unknown" || agentAddr.includes("unknown")) return "";
  try {
    const client = getPublicClient();
    const wallet = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "getWalletByAgent",
      args: [agentAddr],
    });
    const ZERO = "0x0000000000000000000000000000000000000000";
    return wallet && wallet !== ZERO ? wallet : "";
  } catch (err) {
    console.error(`Failed to resolve AA account from factory: ${err.message}`);
    return "";
  }
}

const agentAddress = await resolveWalletAddress();
const aaAccount = await resolveAAAccount(agentAddress);

const effectiveAddress = aaAccount || agentAddress;

const chainLabel = ACTIVE_CHAIN_ID === 84532
  ? "Base Sepolia (testnet)"
  : ACTIVE_CHAIN_ID === 11155111
    ? "Sepolia (testnet)"
    : "Base (mainnet)";

const aaInstructions = aaAccount
  ? [
    ``,
    `== AA Smart Account Protection ==`,
    ``,
    `Your account is protected by on-chain policies:`,
    `  ${explorerAddressUrl(aaAccount)}`,
    `  The PolicyHook enforces whitelists and spend limits before any call executes.`,
    `  Transactions are signed with EIP-712 and routed through the account contract.`,
    ``,
    `AA Inspection Tools:`,
    `- account_info: Read account state (owner, modules, nonce, balance, policy, session)`,
    `- account_check_whitelist: Check if a (target, selector) is allowed`,
    `- account_get_spend_limit: Read spend limit for a token`,
    `- account_get_policy: Read policy config (paused, native value cap)`,
    ``,
    `Whitelist Management Tools:`,
    `- account_request_whitelist: Request whitelisting of a (target, selector) pair.`,
    `  The request goes through the WhitelistRequestModule. The owner must approve it.`,
    `  Returns a tx object — pass it to send_transaction to submit on-chain.`,
    `- account_cancel_whitelist_request: Cancel a pending whitelist request you submitted.`,
    `- account_get_pending_requests: List all pending whitelist requests for the account.`,
    `- account_get_whitelist_request: Look up a specific request by ID.`,
    ``,
    `If a transaction reverts with "NotWhitelisted" or "SpendLimitExceeded",`,
    `use account_check_whitelist to verify, then account_request_whitelist to`,
    `request the missing entry. The owner must approve it before retrying.`,
  ]
  : [];

const server = new McpServer(
  {
    name: "agent-wallet",
    version: "0.3.0",
  },
  {
    instructions: [
      aaAccount
        ? `You have an abstract account (smart contract wallet) on-chain.`
        : `You have an on-chain agent wallet managed by OWS with DeFi capabilities.`,
      ``,
      aaAccount
        ? [
          `YOUR ACCOUNT: ${aaAccount}`,
          `  This is your main address. All funds live here. All balances, swaps,`,
          `  approvals, and DeFi positions belong to this address.`,
          `Gas wallet (EOA): ${agentAddress}`,
          `  This wallet only signs transactions and pays gas fees. Do not check`,
          `  this address for balances — it is NOT where your funds are.`,
        ].join("\n")
        : `Wallet: ${agentAddress}`,
      `Chain: ${chainLabel} (eip155:${ACTIVE_CHAIN_ID})`,
      ``,
      `== DeFi Tools ==`,
      ``,
      `Uniswap V3 (Router: ${PROTOCOLS.UNISWAP_V3_ROUTER}):`,
      `- uniswap_swap: Encode a swap transaction. Returns tx for send_transaction.`,
      `- uniswap_quote: Get a price quote without executing.`,
      ``,
      `Aave V3 (Pool: ${PROTOCOLS.AAVE_V3_POOL}):`,
      `- aave_supply: Encode a supply/deposit transaction.`,
      `- aave_withdraw: Encode a withdrawal transaction.`,
      `- aave_borrow: Encode a borrow transaction.`,
      `- aave_repay: Encode a repayment transaction.`,
      `- aave_get_user_data: Read account health factor, collateral, debt.`,
      `- aave_get_reserves: List available Aave markets.`,
      ``,
      `Tokens & Balances:`,
      `- get_balance: Check native ETH and ERC-20 balances.`,
      `- get_token_info: Read token metadata (name, symbol, decimals).`,
      `- approve_erc20: Encode an approval (required before swap/supply).`,
      `- transfer_erc20: Encode a token transfer.`,
      ``,
      `Generic Contract Interaction:`,
      `- contract_read: Call any view/pure function on any contract.`,
      `- contract_encode: Encode calldata for any function.`,
      ``,
      `Transaction Execution:`,
      `- send_transaction: Sign and broadcast an encoded tx. Supports optional nonce and gas overrides for replacing stuck txs.`,
      `- cancel_transaction: Cancel a stuck tx by re-sending at the same nonce with higher gas.`,
      `- get_pending_nonce: Check if any transactions are stuck in the mempool.`,
      `- get_transaction: Look up a transaction by hash.`,
      ``,
      `Wallet:`,
      `- sign_message: Sign arbitrary data with the agent wallet.`,
      `- get_address: Get the agent wallet address.`,
      ``,
      `== Common Token Addresses (Base) ==`,
      `WETH:  ${TOKENS.WETH}`,
      `USDC:  ${TOKENS.USDC}`,
      `USDT:  ${TOKENS.USDT}`,
      `DAI:   ${TOKENS.DAI}`,
      `cbETH: ${TOKENS.cbETH}`,
      `wstETH: ${TOKENS.wstETH}`,
      ...aaInstructions,
      ``,
      `== Typical Workflow ==`,
      `1. Check balance: get_balance`,
      `2. Approve token: approve_erc20 (token -> protocol)`,
      `3. Build tx: uniswap_swap / aave_supply / contract_encode`,
      `4. Execute: send_transaction with the returned tx object`,
      `5. Verify: get_transaction with the returned hash`,
      ``,
      `== If a transaction is stuck ==`,
      `1. get_pending_nonce — check if nonces are blocked`,
      `2. cancel_transaction with the stuck nonce — clears the queue`,
      `3. Retry the original transaction`,
      ``,
      `Security: All signing is performed through this MCP server via OWS.`,
      aaAccount
        ? `Transactions are enforced by on-chain AA policies (whitelists, spend limits) via IsolatedAccount.`
        : `Transactions are restricted by OWS policies.`,
    ].join("\n"),
  }
);

// --- Core wallet tools ---

server.tool(
  "sign_message",
  "Sign a message with the agent wallet. Returns the signature hex string.",
  {
    message: z.string().describe("The message to sign"),
    chain: z
      .string()
      .default("base")
      .describe("Chain name (e.g. base, ethereum). Default: base"),
  },
  async ({ message, chain }) => {
    const apiKey = await readApiKey();
    const signature = await owsExec(
      ["sign", "message", "--wallet", WALLET_NAME, "--chain", chain, "--message", message],
      apiKey
    );
    return {
      content: [{ type: "text", text: signature }],
    };
  }
);

server.tool(
  "get_address",
  "Get the agent wallet's EVM address.",
  {},
  async () => {
    const apiKey = await readApiKey();
    const output = await owsExec(
      ["wallet", "list"],
      apiKey
    );
    const match = output.match(/0x[0-9a-fA-F]{40}/);
    if (!match) {
      throw new Error("Could not extract EVM address from wallet list");
    }
    return {
      content: [{ type: "text", text: match[0] }],
    };
  }
);

// --- DeFi tools ---

registerUniswapTools(server, effectiveAddress);
registerAaveTools(server, effectiveAddress);
registerBalanceTools(server, { effectiveAddress, agentAddress, aaEnabled: !!aaAccount });
registerTokenTools(server, effectiveAddress);
registerContractTools(server);
registerTransactionTools(server, { owsExec, readApiKey, walletName: WALLET_NAME, agentAddress, aaAccount });

// --- AA inspection tools ---

registerAccountTools(server, { owsExec, readApiKey, walletName: WALLET_NAME, agentAddress, aaAccount });

// --- Legacy prompt (kept for backwards compat) ---

server.prompt(
  "uniswap-swap",
  "[DEPRECATED: use uniswap_swap tool instead] Generate a Uniswap V3 swap calldata for signing.",
  {
    tokenIn: z.string().optional().describe("Input token address (default: WETH on Base)"),
    tokenOut: z.string().optional().describe("Output token address (default: USDC on Base)"),
    amountIn: z.string().optional().describe("Amount of input token (default: 0.01)"),
  },
  async ({ tokenIn, tokenOut, amountIn }) => {
    tokenIn = tokenIn || TOKENS.WETH;
    tokenOut = tokenOut || TOKENS.USDC;
    amountIn = amountIn || "0.01";
    const swapPayload = JSON.stringify({
      action: "uniswap-v3-swap",
      chain: "base",
      router: PROTOCOLS.UNISWAP_V3_ROUTER,
      params: {
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: agentAddress,
        amountIn,
        amountOutMinimum: "0",
        sqrtPriceLimitX96: "0",
      },
      agent: agentAddress,
      timestamp: new Date().toISOString(),
    });

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `NOTE: This prompt is deprecated. Use the uniswap_swap tool for real calldata encoding.`,
              ``,
              `Sign the following Uniswap V3 swap payload using the sign_message tool:`,
              ``,
              swapPayload,
              ``,
              `After signing, return the signature and the full payload so it can be submitted on-chain.`,
            ].join("\n"),
          },
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
