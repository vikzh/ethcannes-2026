import { z } from "zod";
import { serializeTransaction, parseGwei } from "viem";
import { getPublicClient } from "../lib/rpc.js";

async function buildAndBroadcast({
  publicClient,
  owsExec,
  readApiKey,
  walletName,
  fromAddress,
  to,
  data,
  value,
  chainId,
  nonce: explicitNonce,
  maxFeePerGas: explicitMaxFee,
  maxPriorityFeePerGas: explicitPriorityFee,
  gasMultiplierPct = 130,
}) {
  const apiKey = await readApiKey();

  const pendingNonce = await publicClient.getTransactionCount({
    address: fromAddress,
    blockTag: "pending",
  });
  const nonce = explicitNonce ?? pendingNonce;

  let gasEstimate;
  try {
    gasEstimate = await publicClient.estimateGas({
      account: fromAddress,
      to,
      data,
      value: BigInt(value),
      nonce,
    });
  } catch {
    gasEstimate = 200_000n;
  }
  const gas = (gasEstimate * BigInt(gasMultiplierPct)) / 100n;

  const feeData = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = explicitMaxFee ?? feeData.maxFeePerGas;
  const maxPriorityFeePerGas = explicitPriorityFee ?? feeData.maxPriorityFeePerGas;

  const unsignedTx = {
    to,
    data,
    value: BigInt(value),
    nonce,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId,
    type: "eip1559",
  };

  const serializedUnsigned = serializeTransaction(unsignedTx);
  const txHex = serializedUnsigned.startsWith("0x")
    ? serializedUnsigned.slice(2)
    : serializedUnsigned;

  const result = await owsExec(
    ["sign", "send-tx", "--chain", "base", "--wallet", walletName, "--tx", txHex, "--json"],
    apiKey,
  );

  let txHash;
  try {
    const parsed = JSON.parse(result);
    txHash = parsed.hash || parsed.tx_hash || parsed.txHash || parsed.transaction_hash;
  } catch {
    const hashMatch = result.match(/0x[0-9a-fA-F]{64}/);
    txHash = hashMatch ? hashMatch[0] : null;
  }

  return { txHash, nonce, gas, maxFeePerGas, maxPriorityFeePerGas, rawOutput: result };
}

export function registerTransactionTools(server, { owsExec, readApiKey, walletName, agentAddress }) {
  server.tool(
    "send_transaction",
    "Sign and broadcast a transaction on Base via the agent wallet (OWS). Takes an encoded tx object (from uniswap_swap, aave_supply, approve_erc20, contract_encode, etc.) and submits it on-chain. Supports optional nonce override and gas price override for replacing stuck transactions.",
    {
      to: z.string().describe("Target contract/address"),
      data: z.string().describe("Encoded calldata hex string"),
      value: z
        .string()
        .default("0")
        .describe("ETH value to send in wei. Default: 0"),
      chainId: z
        .number()
        .default(8453)
        .describe("Chain ID. Default: 8453 (Base)"),
      nonce: z
        .number()
        .optional()
        .describe("Override nonce. Use to replace a stuck/pending transaction at the same nonce"),
      maxFeePerGasGwei: z
        .string()
        .optional()
        .describe("Override max fee per gas in gwei (e.g. '0.5'). Use higher values to replace stuck transactions"),
      maxPriorityFeePerGasGwei: z
        .string()
        .optional()
        .describe("Override max priority fee per gas in gwei (e.g. '0.1')"),
    },
    async ({ to, data, value, chainId, nonce, maxFeePerGasGwei, maxPriorityFeePerGasGwei }) => {
      if (chainId !== 8453) {
        return {
          content: [{ type: "text", text: `Only Base (chainId 8453) is supported. Got: ${chainId}` }],
          isError: true,
        };
      }

      const fromAddress = agentAddress;
      if (!fromAddress || fromAddress === "unknown" || fromAddress.includes("unknown")) {
        return {
          content: [{ type: "text", text: "Agent wallet address is not available. Run the installer first." }],
          isError: true,
        };
      }

      try {
        const publicClient = getPublicClient();

        const maxFeePerGas = maxFeePerGasGwei ? parseGwei(maxFeePerGasGwei) : undefined;
        const maxPriorityFeePerGas = maxPriorityFeePerGasGwei ? parseGwei(maxPriorityFeePerGasGwei) : undefined;

        const { txHash, nonce: usedNonce, rawOutput } = await buildAndBroadcast({
          publicClient,
          owsExec,
          readApiKey,
          walletName,
          fromAddress,
          to,
          data,
          value,
          chainId,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
        });

        if (!txHash) {
          return {
            content: [{ type: "text", text: `Transaction submitted but could not parse hash from OWS output:\n${rawOutput}` }],
          };
        }

        let receiptText = "";
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
          const status = receipt.status === "success" ? "confirmed" : "reverted";
          receiptText = [
            `  Status: ${status}`,
            `  Block: ${receipt.blockNumber}`,
            `  Gas used: ${receipt.gasUsed.toString()}`,
          ].join("\n");
        } catch {
          receiptText = "  Status: pending (receipt not yet available)";
        }

        const text = [
          `Transaction broadcast via OWS`,
          `  Hash: ${txHash}`,
          `  Nonce: ${usedNonce}`,
          receiptText,
          `  Explorer: https://basescan.org/tx/${txHash}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Transaction failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cancel_transaction",
    "Cancel a stuck/pending transaction by sending a 0-value self-transfer at the same nonce with higher gas. Use get_pending_nonce first to find the stuck nonce.",
    {
      nonce: z
        .number()
        .describe("The nonce of the stuck transaction to cancel"),
      maxFeePerGasGwei: z
        .string()
        .optional()
        .describe("Max fee per gas in gwei. Defaults to 2x the current network fee to ensure replacement"),
    },
    async ({ nonce, maxFeePerGasGwei }) => {
      const fromAddress = agentAddress;
      if (!fromAddress || fromAddress === "unknown" || fromAddress.includes("unknown")) {
        return {
          content: [{ type: "text", text: "Agent wallet address is not available. Run the installer first." }],
          isError: true,
        };
      }

      try {
        const publicClient = getPublicClient();

        let maxFeePerGas;
        let maxPriorityFeePerGas;
        if (maxFeePerGasGwei) {
          maxFeePerGas = parseGwei(maxFeePerGasGwei);
          maxPriorityFeePerGas = maxFeePerGas;
        } else {
          const feeData = await publicClient.estimateFeesPerGas();
          maxFeePerGas = feeData.maxFeePerGas * 3n;
          maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * 3n;
        }

        const { txHash, rawOutput } = await buildAndBroadcast({
          publicClient,
          owsExec,
          readApiKey,
          walletName,
          fromAddress,
          to: fromAddress,
          data: "0x",
          value: "0",
          chainId: 8453,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasMultiplierPct: 100,
        });

        if (!txHash) {
          return {
            content: [{ type: "text", text: `Cancel submitted but could not parse hash from OWS output:\n${rawOutput}` }],
          };
        }

        let receiptText = "";
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
          const status = receipt.status === "success" ? "confirmed" : "reverted";
          receiptText = [
            `  Status: ${status}`,
            `  Block: ${receipt.blockNumber}`,
            `  Gas used: ${receipt.gasUsed.toString()}`,
          ].join("\n");
        } catch {
          receiptText = "  Status: pending (waiting for confirmation)";
        }

        const text = [
          `Cancellation tx broadcast (0 ETH self-transfer at nonce ${nonce})`,
          `  Hash: ${txHash}`,
          receiptText,
          `  Explorer: https://basescan.org/tx/${txHash}`,
          ``,
          `The stuck nonce ${nonce} should now be cleared. You can retry the original transaction.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Cancel failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_pending_nonce",
    "Get the current and pending nonce for the agent wallet on Base. If pending > confirmed, there are stuck transactions in the mempool.",
    {},
    async () => {
      const fromAddress = agentAddress;
      if (!fromAddress || fromAddress === "unknown" || fromAddress.includes("unknown")) {
        return {
          content: [{ type: "text", text: "Agent wallet address is not available." }],
          isError: true,
        };
      }

      const publicClient = getPublicClient();
      const [confirmed, pending] = await Promise.all([
        publicClient.getTransactionCount({ address: fromAddress, blockTag: "latest" }),
        publicClient.getTransactionCount({ address: fromAddress, blockTag: "pending" }),
      ]);

      const stuck = pending > confirmed;
      const lines = [
        `Nonce status for ${fromAddress}`,
        `  Confirmed (latest): ${confirmed}`,
        `  Pending: ${pending}`,
      ];

      if (stuck) {
        lines.push(`  STUCK: ${pending - confirmed} transaction(s) pending in mempool`);
        lines.push(`  Stuck nonce(s): ${confirmed} through ${pending - 1}`);
        lines.push(``);
        lines.push(`To cancel: use cancel_transaction with nonce ${confirmed}`);
      } else {
        lines.push(`  No stuck transactions`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_transaction",
    "Get details of a transaction by hash on Base.",
    {
      hash: z.string().describe("Transaction hash"),
    },
    async ({ hash }) => {
      const client = getPublicClient();
      try {
        const [tx, receipt] = await Promise.all([
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }).catch(() => null),
        ]);

        const lines = [
          `Transaction: ${hash}`,
          `  From: ${tx.from}`,
          `  To: ${tx.to}`,
          `  Value: ${tx.value.toString()} wei`,
          `  Nonce: ${tx.nonce}`,
          `  Block: ${tx.blockNumber}`,
        ];

        if (receipt) {
          lines.push(`  Status: ${receipt.status}`);
          lines.push(`  Gas used: ${receipt.gasUsed.toString()}`);
          lines.push(`  Effective gas price: ${receipt.effectiveGasPrice.toString()}`);
        }

        lines.push(`  Explorer: https://basescan.org/tx/${hash}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to get transaction: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
