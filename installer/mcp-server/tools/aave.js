import { z } from "zod";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { AAVE_V3_POOL_ABI } from "../lib/abi/aave-v3.js";
import { PROTOCOLS, getDecimals, ACTIVE_CHAIN_ID } from "../lib/constants.js";
import { getPublicClient } from "../lib/rpc.js";

const POOL = PROTOCOLS.AAVE_V3_POOL;

export function registerAaveTools(server, defaultAddress) {
  server.tool(
    "aave_supply",
    "Encode an Aave V3 supply (deposit) transaction on Base. You must approve_erc20 the asset to the Aave Pool first. Returns encoded tx for send_transaction.",
    {
      asset: z.string().describe("Token address to supply (e.g. USDC, WETH)"),
      amount: z
        .string()
        .describe("Amount to supply in human-readable units"),
      onBehalfOf: z
        .string()
        .optional()
        .describe("Address to receive aTokens. Defaults to your account"),
    },
    async ({ asset, amount, onBehalfOf }) => {
      const behalf = onBehalfOf || defaultAddress;
      const decimals = await getDecimals(asset);
      const amountWei = parseUnits(amount, decimals);

      const calldata = encodeFunctionData({
        abi: AAVE_V3_POOL_ABI,
        functionName: "supply",
        args: [asset, amountWei, behalf, 0],
      });

      const tx = {
        to: POOL,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `Aave V3 Supply`,
        `  Asset: ${asset}`,
        `  Amount: ${amount}`,
        `  On behalf of: ${behalf}`,
        `  Pool: ${POOL}`,
        ``,
        `Prerequisites: approve_erc20 ${asset} to spender ${POOL} for amount ${amount}.`,
        `Then call send_transaction with this tx object to execute.`,
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
    "aave_withdraw",
    "Encode an Aave V3 withdraw transaction on Base. Withdraws supplied assets. Returns encoded tx for send_transaction.",
    {
      asset: z.string().describe("Token address to withdraw"),
      amount: z
        .string()
        .describe("Amount to withdraw in human-readable units, or 'max' for all"),
      to: z
        .string()
        .optional()
        .describe("Recipient address. Defaults to your account"),
    },
    async ({ asset, amount, to }) => {
      const recipient = to || defaultAddress;
      const decimals = await getDecimals(asset);
      const amountWei =
        amount.toLowerCase() === "max"
          ? 2n ** 256n - 1n // type(uint256).max signals "withdraw all"
          : parseUnits(amount, decimals);

      const calldata = encodeFunctionData({
        abi: AAVE_V3_POOL_ABI,
        functionName: "withdraw",
        args: [asset, amountWei, recipient],
      });

      const tx = {
        to: POOL,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `Aave V3 Withdraw`,
        `  Asset: ${asset}`,
        `  Amount: ${amount}`,
        `  To: ${recipient}`,
        `  Pool: ${POOL}`,
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
    "aave_borrow",
    "Encode an Aave V3 borrow transaction on Base. You must have supplied collateral first. Returns encoded tx for send_transaction.",
    {
      asset: z.string().describe("Token address to borrow"),
      amount: z
        .string()
        .describe("Amount to borrow in human-readable units"),
      interestRateMode: z
        .number()
        .default(2)
        .describe("Interest rate mode: 1=stable (if available), 2=variable. Default: 2"),
      onBehalfOf: z
        .string()
        .optional()
        .describe("Address to receive debt. Defaults to your account"),
    },
    async ({ asset, amount, interestRateMode, onBehalfOf }) => {
      const behalf = onBehalfOf || defaultAddress;
      const decimals = await getDecimals(asset);
      const amountWei = parseUnits(amount, decimals);

      const calldata = encodeFunctionData({
        abi: AAVE_V3_POOL_ABI,
        functionName: "borrow",
        args: [asset, amountWei, BigInt(interestRateMode), 0, behalf],
      });

      const tx = {
        to: POOL,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `Aave V3 Borrow`,
        `  Asset: ${asset}`,
        `  Amount: ${amount}`,
        `  Rate mode: ${interestRateMode === 1 ? "stable" : "variable"}`,
        `  On behalf of: ${behalf}`,
        `  Pool: ${POOL}`,
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
    "aave_repay",
    "Encode an Aave V3 repay transaction on Base. You must approve_erc20 the asset to the Aave Pool first. Returns encoded tx for send_transaction.",
    {
      asset: z.string().describe("Token address to repay"),
      amount: z
        .string()
        .describe("Amount to repay in human-readable units, or 'max' to repay all debt"),
      interestRateMode: z
        .number()
        .default(2)
        .describe("Interest rate mode of the debt: 1=stable, 2=variable. Default: 2"),
      onBehalfOf: z
        .string()
        .optional()
        .describe("Address whose debt to repay. Defaults to your account"),
    },
    async ({ asset, amount, interestRateMode, onBehalfOf }) => {
      const behalf = onBehalfOf || defaultAddress;
      const decimals = await getDecimals(asset);
      const amountWei =
        amount.toLowerCase() === "max"
          ? 2n ** 256n - 1n
          : parseUnits(amount, decimals);

      const calldata = encodeFunctionData({
        abi: AAVE_V3_POOL_ABI,
        functionName: "repay",
        args: [asset, amountWei, BigInt(interestRateMode), behalf],
      });

      const tx = {
        to: POOL,
        data: calldata,
        value: "0",
        chainId: ACTIVE_CHAIN_ID,
      };

      const text = [
        `Aave V3 Repay`,
        `  Asset: ${asset}`,
        `  Amount: ${amount}`,
        `  Rate mode: ${interestRateMode === 1 ? "stable" : "variable"}`,
        `  On behalf of: ${behalf}`,
        `  Pool: ${POOL}`,
        ``,
        `Prerequisites: approve_erc20 ${asset} to spender ${POOL} for amount ${amount}.`,
        `Then call send_transaction with this tx object to execute.`,
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
    "aave_get_user_data",
    "Read an address's Aave V3 account data on Base: total collateral, total debt, available borrows, health factor.",
    {
      address: z
        .string()
        .optional()
        .describe("Address to query. Defaults to your account"),
    },
    async ({ address }) => {
      const target = address || defaultAddress;
      const client = getPublicClient();

      try {
        const result = await client.readContract({
          address: POOL,
          abi: AAVE_V3_POOL_ABI,
          functionName: "getUserAccountData",
          args: [target],
        });

        const [
          totalCollateralBase,
          totalDebtBase,
          availableBorrowsBase,
          currentLiquidationThreshold,
          ltv,
          healthFactor,
        ] = result;

        // Values are in base currency units (USD, 8 decimals in Aave V3)
        const fmt = (v) => formatUnits(v, 8);
        const hf =
          healthFactor >= 2n ** 255n
            ? "Infinity (no debt)"
            : formatUnits(healthFactor, 18);

        const text = [
          `Aave V3 Account Data`,
          `  Address: ${target}`,
          `  Total Collateral (USD): $${fmt(totalCollateralBase)}`,
          `  Total Debt (USD): $${fmt(totalDebtBase)}`,
          `  Available Borrows (USD): $${fmt(availableBorrowsBase)}`,
          `  LTV: ${Number(ltv) / 100}%`,
          `  Liquidation Threshold: ${Number(currentLiquidationThreshold) / 100}%`,
          `  Health Factor: ${hf}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to read Aave user data: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "aave_get_reserves",
    "List all Aave V3 reserve (market) addresses on Base.",
    {},
    async () => {
      const client = getPublicClient();
      try {
        const reserves = await client.readContract({
          address: POOL,
          abi: AAVE_V3_POOL_ABI,
          functionName: "getReservesList",
        });
        const text = [
          `Aave V3 Reserves (${reserves.length} markets):`,
          ...reserves.map((r, i) => `  ${i + 1}. ${r}`),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Failed to read reserves: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
