import { z } from "zod";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { SWAP_ROUTER_ABI, QUOTER_V2_ABI } from "../lib/abi/uniswap-v3.js";
import {
  PROTOCOLS,
  TOKENS,
  SEPOLIA_TOKENS,
  getDecimals,
  ACTIVE_CHAIN_ID,
  WRAPPED_NATIVE_TOKEN,
} from "../lib/constants.js";
import { getPublicClient } from "../lib/rpc.js";
import { sepolia } from "viem/chains";

const SYMBOL_BY_ADDRESS = Object.fromEntries([
  ...Object.entries(TOKENS).map(([sym, addr]) => [addr.toLowerCase(), sym]),
  ...Object.entries(SEPOLIA_TOKENS).map(([sym, addr]) => [addr.toLowerCase(), sym]),
]);

const UNISWAP_CHAIN_LABEL =
  ACTIVE_CHAIN_ID === sepolia.id ? "Ethereum Sepolia" : "Base";

function tokenLabel(addr) {
  return SYMBOL_BY_ADDRESS[addr.toLowerCase()] || addr;
}

export function registerUniswapTools(server, defaultAddress) {
  server.tool(
    "uniswap_swap",
    `Encode a Uniswap V3 SwapRouter02 exactInputSingle swap on ${UNISWAP_CHAIN_LABEL} (chainId ${ACTIVE_CHAIN_ID}). Uses this chain's official router and QuoterV2 so pool discovery matches on-chain liquidity. Returns tx for send_transaction. Requires a successful quote (fails if no pool / wrong fee). Approve tokenIn to the router via approve_erc20 unless paying with native ETH (use wrapped native token address as tokenIn and send value).`,
    {
      tokenIn: z
        .string()
        .describe(
          ACTIVE_CHAIN_ID === sepolia.id
            ? "Input token (e.g. Sepolia WETH9: 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14)"
            : "Input token (e.g. Base WETH: 0x4200000000000000000000000000000000000006)",
        ),
      tokenOut: z
        .string()
        .describe(
          ACTIVE_CHAIN_ID === sepolia.id
            ? "Output token (e.g. Sepolia USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)"
            : "Output token (e.g. Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)",
        ),
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
      const to = recipient || defaultAddress;
      const [decimalsIn, decimalsOut] = await Promise.all([
        getDecimals(tokenIn),
        getDecimals(tokenOut),
      ]);
      const amountInWei = parseUnits(amountIn, decimalsIn);

      const labelIn = tokenLabel(tokenIn);
      const labelOut = tokenLabel(tokenOut);

      let amountOutMin;
      let quotedOutFormatted;
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
        if (quotedOut === 0n) {
          return {
            content: [
              {
                type: "text",
                text: [
                  `Uniswap quote returned 0 output — not encoding a swap.`,
                  `  QuoterV2: ${PROTOCOLS.UNISWAP_V3_QUOTER} | fee tier: ${fee}`,
                  `  Try another fee (500, 3000, 10000) or verify token addresses and pool liquidity on chain ${ACTIVE_CHAIN_ID}.`,
                ].join("\n"),
              },
            ],
            isError: true,
          };
        }
        quotedOutFormatted = formatUnits(quotedOut, decimalsOut);
        amountOutMin = quotedOut - (quotedOut * BigInt(slippageBps)) / 10000n;
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: [
                `Uniswap QuoterV2 failed — not encoding a swap (avoids amountOutMinimum=0).`,
                `  ${err?.shortMessage || err?.message || String(err)}`,
                `  Router: ${PROTOCOLS.UNISWAP_V3_ROUTER} | QuoterV2: ${PROTOCOLS.UNISWAP_V3_QUOTER}`,
                `  chainId: ${ACTIVE_CHAIN_ID} (${UNISWAP_CHAIN_LABEL})`,
              ].join("\n"),
            },
          ],
          isError: true,
        };
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
        tokenIn.toLowerCase() === WRAPPED_NATIVE_TOKEN.toLowerCase();

      const tx = {
        to: PROTOCOLS.UNISWAP_V3_ROUTER,
        data: calldata,
        value: isNativeIn ? amountInWei.toString() : "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const preview = [
        `Uniswap V3 Swap`,
        `  ${amountIn} ${labelIn} -> ${labelOut}`,
        quotedOutFormatted
          ? `  Expected output: ~${quotedOutFormatted} ${labelOut}`
          : null,
        `  Fee tier: ${fee / 10000}%`,
        `  Recipient: ${to}`,
        `  Slippage: ${slippageBps / 100}%`,
        `  Min output: ${formatUnits(amountOutMin, decimalsOut)} ${labelOut}`,
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
    `Get a Uniswap V3 QuoterV2 price on ${UNISWAP_CHAIN_LABEL} without executing.`,
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
        getDecimals(tokenIn),
        getDecimals(tokenOut),
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
