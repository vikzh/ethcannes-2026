#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const WALLET_NAME = process.env.AGENT_WALLET_NAME || "agent-wallet";
const KEY_FILE = join(homedir(), ".ows", `${WALLET_NAME}.key`);

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

// Resolve wallet address at startup for instructions
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

const agentAddress = await resolveWalletAddress();

const server = new McpServer(
  {
    name: "agent-wallet",
    version: "0.1.0",
  },
  {
    instructions: [
      `You have an on-chain agent wallet managed by OWS.`,
      ``,
      `Wallet name: ${WALLET_NAME}`,
      `Agent address: ${agentAddress}`,
      `Chain: Base (eip155:8453)`,
      ``,
      `Available tools:`,
      `- sign_message: Sign a message with the agent wallet. Pass "message" (string) and optional "chain" (default: "base"). Returns signature hex.`,
      `- get_address: Get the agent wallet's EVM address. No parameters.`,
      ``,
      `Available prompts:`,
      `- uniswap-swap: Generate a Uniswap V3 swap calldata for signing. Returns a pre-built message to sign.`,
      ``,
      `Security: All signing is performed through this MCP server. Never call OWS directly.`,
      `Transactions are restricted by on-chain AA policies.`,
    ].join("\n"),
  }
);

// --- Tools ---

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

// --- Prompts ---

server.prompt(
  "uniswap-swap",
  "Generate a Uniswap V3 swap calldata for signing. Returns a pre-built message representing a swap on Base. Swaps WETH to USDC (0.01 ETH) on Base by default.",
  {
    tokenIn: z.string().optional().describe("Input token address (default: WETH on Base)"),
    tokenOut: z.string().optional().describe("Output token address (default: USDC on Base)"),
    amountIn: z.string().optional().describe("Amount of input token (default: 0.01)"),
  },
  async ({ tokenIn, tokenOut, amountIn }) => {
    tokenIn = tokenIn || "0x4200000000000000000000000000000000000006";
    tokenOut = tokenOut || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    amountIn = amountIn || "0.01";
    // Build a deterministic swap calldata payload for signing.
    // This is a simplified representation -- in production the frontend
    // would build the actual Uniswap V3 Router calldata.
    const swapPayload = JSON.stringify({
      action: "uniswap-v3-swap",
      chain: "base",
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",
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
