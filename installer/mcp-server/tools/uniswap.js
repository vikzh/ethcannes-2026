import { z } from "zod";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { SWAP_ROUTER_ABI, QUOTER_V2_ABI } from "../lib/abi/uniswap-v3.js";
import { PROTOCOLS, TOKENS, getDecimals, TOKEN_DECIMALS } from "../lib/constants.js";
import { getPublicClient } from "../lib/rpc.js";
import { ERC20_ABI } from "../lib/abi/erc20.js";

const SYMBOL_BY_ADDRESS = Object.fromEntries(
  Object.entries(TOKENS).map(([sym, addr]) => [addr.toLowerCase(), sym])
);

function tokenLabel(addr) {
  return SYMBOL_BY_ADDRESS[addr.toLowerCase()] || addr;
}

async function resolveDecimals(tokenAddress) {
  const known = TOKEN_DECIMALS[tokenAddress.toLowerCase()];
  if (known !== undefined) return known;
  try {
    const client = getPublicClient();
    const d = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    return Number(d);
  } catch {
    return 18;
  }
}

export function registerUniswapTools(server, agentAddress) {
  server.tool(
    "uniswap_swap",
    "Encode a Uniswap V3 exactInputSingle swap transaction on Base. Returns encoded calldata ready for send_transaction. Must approve tokenIn to the router first using approve_erc20 (unless swapping native ETH).",
    {
      tokenIn: z
        .string()
        .describe("Input token address (e.g. WETH: 0x4200000000000000000000000000000000000006)"),
      tokenOut: z
        .string()
        .describe("Output token address (e.g. USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)"),
      amountIn: z
        .string()
        .describe("Amount of input token in human-readable units (e.g. '0.01' for 0.01 WETH)"),
      fee: z
        .number()
        .default(3000)
        .describe("Pool fee tier in hundredths of a bip (500=0.05%, 3000=0.3%, 10000=1%). Default: 3000"),
      slippageBps: z
        .number()
        .default(50)
        .describe("Slippage tolerance in basis points (50 = 0.5%). Default: 50"),
      recipient: z
        .string()
        .optional()
        .describe("Recipient address. Defaults to agent wallet address"),
    },
    async ({ tokenIn, tokenOut, amountIn, fee, slippageBps, recipient }) => {
      const to = recipient || agentAddress;
      const [decimalsIn, decimalsOut] = await Promise.all([
        resolveDecimals(tokenIn),
        resolveDecimals(tokenOut),
      ]);
      const amountInWei = parseUnits(amountIn, decimalsIn);

      const labelIn = tokenLabel(tokenIn);
      const labelOut = tokenLabel(tokenOut);

      let amountOutMin = 0n;
      let quotedOutFormatted = null;
      try {
        const client = getPublicClient();
        const quoteResult = await client.simulateContract({
          address: PROTOCOLS.UNISWAP_V3_QUOTER,
          abi: QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn: amountInWei,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const quotedOut = quoteResult.result[0];
        quotedOutFormatted = formatUnits(quotedOut, decimalsOut);
        amountOutMin = quotedOut - (quotedOut * BigInt(slippageBps)) / 10000n;
      } catch {
        amountOutMin = 0n;
      }

      const calldata = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            fee,
            recipient: to,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const isNativeIn =
        tokenIn.toLowerCase() === TOKENS.WETH.toLowerCase();

      const tx = {
        to: PROTOCOLS.UNISWAP_V3_ROUTER,
        data: calldata,
        value: isNativeIn ? amountInWei.toString() : "0",
        chainId: 8453,
      };

      const preview = [
        `Uniswap V3 Swap on Base`,
        `  ${amountIn} ${labelIn} -> ${labelOut}`,
        quotedOutFormatted
          ? `  Expected output: ~${quotedOutFormatted} ${labelOut}`
          : null,
        `  Fee tier: ${fee / 10000}%`,
        `  Recipient: ${to}`,
        `  Slippage: ${slippageBps / 100}%`,
        amountOutMin > 0n
          ? `  Min output: ${formatUnits(amountOutMin, decimalsOut)} ${labelOut}`
          : `  WARNING: Could not quote — amountOutMinimum is 0 (no slippage protection)`,
        ``,
        `Next step: call send_transaction with this tx object to execute.`,
        isNativeIn
          ? ""
          : `NOTE: You must first approve_erc20 for ${tokenIn} to spender ${PROTOCOLS.UNISWAP_V3_ROUTER} for amount ${amountIn}.`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [
          { type: "text", text: preview },
          { type: "text", text: JSON.stringify(tx) },
        ],
      };
    }
  );

  server.tool(
    "uniswap_quote",
    "Get a price quote for a Uniswap V3 swap on Base without executing. Returns the expected output amount.",
    {
      tokenIn: z.string().describe("Input token address"),
      tokenOut: z.string().describe("Output token address"),
      amountIn: z
        .string()
        .describe("Amount of input token in human-readable units"),
      fee: z
        .number()
        .default(3000)
        .describe("Pool fee tier (500, 3000, or 10000). Default: 3000"),
    },
    async ({ tokenIn, tokenOut, amountIn, fee }) => {
      const [decimalsIn, decimalsOut] = await Promise.all([
        resolveDecimals(tokenIn),
        resolveDecimals(tokenOut),
      ]);
      const amountInWei = parseUnits(amountIn, decimalsIn);
      const labelIn = tokenLabel(tokenIn);
      const labelOut = tokenLabel(tokenOut);

      const client = getPublicClient();
      try {
        const quoteResult = await client.simulateContract({
          address: PROTOCOLS.UNISWAP_V3_QUOTER,
          abi: QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn: amountInWei,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const [amountOut, sqrtPriceAfter, ticksCrossed, gasEstimate] =
          quoteResult.result;
        const text = [
          `Quote: ${amountIn} ${labelIn} -> ${formatUnits(amountOut, decimalsOut)} ${labelOut}`,
          `  Fee tier: ${fee / 10000}%`,
          `  Gas estimate: ${gasEstimate.toString()}`,
          `  Ticks crossed: ${ticksCrossed}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Quote failed: ${err.message}. The pool may not exist for this pair/fee tier.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
