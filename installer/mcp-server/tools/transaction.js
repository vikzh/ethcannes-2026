import { z } from "zod";
import { serializeTransaction, parseGwei } from "viem";
import { getPublicClient } from "../lib/rpc.js";
import { AA_ACCOUNT, ACTIVE_CHAIN_ID, RPC_URL, explorerTxUrl } from "../lib/constants.js";
import { buildAATransaction } from "../lib/aa.js";

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
  chainName,
  rpcUrl,
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
    gasEstimate = 500_000n;
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

  const sendArgs = ["sign", "send-tx", "--chain", chainName, "--wallet", walletName, "--tx", txHex, "--json"];
  if (rpcUrl) {
    sendArgs.push("--rpc-url", rpcUrl);
  }

  const result = await owsExec(sendArgs, apiKey);

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

function chainName(chainId) {
  const names = { 8453: "base", 1: "ethereum", 42161: "arbitrum", 10: "optimism", 137: "polygon" };
  return names[chainId] || `eip155:${chainId}`;
}

export function registerTransactionTools(server, { owsExec, readApiKey, walletName, agentAddress }) {
  const activeChainId = ACTIVE_CHAIN_ID;
  const aaAccount = AA_ACCOUNT;

  server.tool(
    "send_transaction",
    "Sign and broadcast a transaction via the agent wallet (OWS). When AA protection is enabled, the inner call is wrapped in IsolatedAccount.executeAuthorized with EIP-712 signing. Takes an encoded tx object (from uniswap_swap, aave_supply, approve_erc20, contract_encode, etc.) and submits it on-chain.",
    {
      to: z.string().describe("Target contract/address"),
      data: z.string().describe("Encoded calldata hex string"),
      value: z
        .string()
        .default("0")
        .describe("ETH value to send in wei. Default: 0"),
      nonce: z
        .number()
        .optional()
        .describe("Override nonce (EOA nonce for direct mode, ignored in AA mode). Use to replace a stuck/pending transaction"),
      maxFeePerGasGwei: z
        .string()
        .optional()
        .describe("Override max fee per gas in gwei (e.g. '0.5'). Use higher values to replace stuck transactions"),
      maxPriorityFeePerGasGwei: z
        .string()
        .optional()
        .describe("Override max priority fee per gas in gwei (e.g. '0.1')"),
    },
    async ({ to, data, value, nonce, maxFeePerGasGwei, maxPriorityFeePerGasGwei }) => {
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

        let outerTo = to;
        let outerData = data;
        let outerValue = value;
        let accountNonce;

        if (aaAccount) {
          const aaResult = await buildAATransaction({
            publicClient,
            owsExec,
            readApiKey,
            walletName,
            accountAddress: aaAccount,
            chainId: activeChainId,
            calls: [{ target: to, value, data }],
          });
          outerTo = aaResult.outerTo;
          outerData = aaResult.outerData;
          outerValue = aaResult.outerValue;
          accountNonce = aaResult.accountNonce;
        }

        const { txHash, nonce: usedNonce, rawOutput } = await buildAndBroadcast({
          publicClient,
          owsExec,
          readApiKey,
          walletName,
          fromAddress,
          to: outerTo,
          data: outerData,
          value: outerValue,
          chainId: activeChainId,
          chainName: chainName(activeChainId),
          rpcUrl: RPC_URL,
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

        const lines = [
          aaAccount ? `Transaction broadcast via AA (IsolatedAccount)` : `Transaction broadcast via OWS`,
          `  Hash: ${txHash}`,
          `  EOA Nonce: ${usedNonce}`,
        ];
        if (accountNonce !== undefined) {
          lines.push(`  AA Account Nonce: ${accountNonce.toString()}`);
        }
        lines.push(receiptText);
        lines.push(`  Explorer: ${explorerTxUrl(txHash)}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
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
        .describe("Max fee per gas in gwei. Defaults to 3x the current network fee to ensure replacement"),
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
          chainId: activeChainId,
          chainName: chainName(activeChainId),
          rpcUrl: RPC_URL,
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
          `  Explorer: ${explorerTxUrl(txHash)}`,
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
    "Get the current and pending nonce for the agent wallet. If pending > confirmed, there are stuck transactions in the mempool.",
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
    "Get details of a transaction by hash.",
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

        lines.push(`  Explorer: ${explorerTxUrl(hash)}`);
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
