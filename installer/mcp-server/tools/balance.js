import { z } from "zod";
import { formatUnits, formatEther } from "viem";
import { ERC20_ABI } from "../lib/abi/erc20.js";
import { getPublicClient } from "../lib/rpc.js";
import { ACTIVE_CHAIN_ID } from "../lib/constants.js";

export function registerBalanceTools(server, { effectiveAddress, agentAddress, aaEnabled }) {
  const chainLabel = ACTIVE_CHAIN_ID === 84532
    ? "Base Sepolia"
    : ACTIVE_CHAIN_ID === 11155111
      ? "Sepolia"
      : "Base";

  server.tool(
    "get_balance",
    aaEnabled
      ? "Get your account's native ETH and/or ERC-20 token balance. Also shows the gas wallet balance. Defaults to your account address."
      : "Get the native ETH balance and/or ERC-20 token balance for an address. Defaults to the agent wallet address.",
    {
      address: z
        .string()
        .optional()
        .describe(
          aaEnabled
            ? "Address to check. Defaults to your account address"
            : "Address to check. Defaults to agent wallet address"
        ),
      tokenAddress: z
        .string()
        .optional()
        .describe("ERC-20 token contract address. Omit to get native ETH balance only"),
    },
    async ({ address, tokenAddress }) => {
      const target = address || effectiveAddress;
      const client = getPublicClient();
      const lines = [];

      if (aaEnabled && !address) {
        lines.push(`Account: ${effectiveAddress}`);
      }

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
      lines.push(`Chain: ${chainLabel} (${ACTIVE_CHAIN_ID})`);

      if (aaEnabled && !address) {
        const agentEth = await client.getBalance({ address: agentAddress });
        lines.push(``);
        lines.push(`Gas wallet: ${agentAddress}`);
        lines.push(`Gas wallet ETH: ${formatEther(agentEth)} ETH`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_token_info",
    `Get metadata for an ERC-20 token on ${chainLabel}: name, symbol, decimals, total supply.`,
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
          `Chain: ${chainLabel} (${ACTIVE_CHAIN_ID})`,
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
