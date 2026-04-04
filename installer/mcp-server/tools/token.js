import { z } from "zod";
import { encodeFunctionData, parseUnits, maxUint256 } from "viem";
import { ERC20_ABI } from "../lib/abi/erc20.js";
import { getDecimals, ACTIVE_CHAIN_ID } from "../lib/constants.js";

export function registerTokenTools(server, _defaultAddress) {
  server.tool(
    "approve_erc20",
    "Encode an ERC-20 approve transaction on Base. Required before interacting with protocols (Uniswap, Aave) that need to spend your tokens. Returns encoded tx for send_transaction.",
    {
      tokenAddress: z.string().describe("ERC-20 token contract address"),
      spender: z
        .string()
        .describe("Address to approve (e.g. Uniswap Router, Aave Pool)"),
      amount: z
        .string()
        .optional()
        .describe("Amount to approve in human-readable units. Omit for max (unlimited) approval"),
    },
    async ({ tokenAddress, spender, amount }) => {
      let amountWei;
      let amountDisplay;
      if (amount) {
        const decimals = await getDecimals(tokenAddress);
        amountWei = parseUnits(amount, decimals);
        amountDisplay = amount;
      } else {
        amountWei = maxUint256;
        amountDisplay = "unlimited";
      }

      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amountWei],
      });

      const tx = {
        to: tokenAddress,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `ERC-20 Approve`,
        `  Token: ${tokenAddress}`,
        `  Spender: ${spender}`,
        `  Amount: ${amountDisplay}`,
        ``,
        `Call send_transaction with this tx object to execute.`,
      ].join("\n");

      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify(tx) },
        ],
      };
    }
  );

  server.tool(
    "transfer_erc20",
    "Encode an ERC-20 transfer transaction on Base. Returns encoded tx for send_transaction.",
    {
      tokenAddress: z.string().describe("ERC-20 token contract address"),
      to: z.string().describe("Recipient address"),
      amount: z
        .string()
        .describe("Amount to transfer in human-readable units"),
    },
    async ({ tokenAddress, to, amount }) => {
      const decimals = await getDecimals(tokenAddress);
      const amountWei = parseUnits(amount, decimals);

      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amountWei],
      });

      const tx = {
        to: tokenAddress,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `ERC-20 Transfer`,
        `  Token: ${tokenAddress}`,
        `  To: ${to}`,
        `  Amount: ${amount}`,
        ``,
        `Call send_transaction with this tx object to execute.`,
      ].join("\n");

      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify(tx) },
        ],
      };
    }
  );
}
