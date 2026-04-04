import { z } from "zod";
import { formatUnits, formatEther } from "viem";
import { ERC20_ABI } from "../lib/abi/erc20.js";
import { getPublicClient } from "../lib/rpc.js";

export function registerBalanceTools(server, agentAddress) {
  server.tool(
    "get_balance",
    "Get the native ETH balance and/or ERC-20 token balance for an address on Base. Defaults to the agent wallet address.",
    {
      address: z
        .string()
        .optional()
        .describe("Address to check. Defaults to agent wallet address"),
      tokenAddress: z
        .string()
        .optional()
        .describe("ERC-20 token contract address. Omit to get native ETH balance only"),
    },
    async ({ address, tokenAddress }) => {
      const target = address || agentAddress;
      const client = getPublicClient();
      const lines = [];

      const ethBalance = await client.getBalance({ address: target });
      lines.push(`Native ETH: ${formatEther(ethBalance)} ETH`);

      if (tokenAddress) {
        try {
          const [balance, decimals, symbol] = await Promise.all([
            client.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [target],
            }),
            client.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
            client.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "symbol",
            }),
          ]);
          lines.push(
            `${symbol}: ${formatUnits(balance, decimals)} (${tokenAddress})`
          );
        } catch (err) {
          lines.push(
            `Error reading token ${tokenAddress}: ${err.message}`
          );
        }
      }

      lines.push(`\nAddress: ${target}`);
      lines.push(`Chain: Base (8453)`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_token_info",
    "Get metadata for an ERC-20 token on Base: name, symbol, decimals, total supply.",
    {
      tokenAddress: z.string().describe("ERC-20 token contract address"),
    },
    async ({ tokenAddress }) => {
      const client = getPublicClient();
      try {
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "name",
          }),
          client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "symbol",
          }),
          client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
          client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "totalSupply",
          }),
        ]);
        const text = [
          `Token: ${name} (${symbol})`,
          `Address: ${tokenAddress}`,
          `Decimals: ${decimals}`,
          `Total Supply: ${formatUnits(totalSupply, decimals)}`,
          `Chain: Base (8453)`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Failed to read token info: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
