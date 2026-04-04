import { z } from "zod";
import { encodeFunctionData, parseAbi } from "viem";
import { getPublicClient } from "../lib/rpc.js";

function parseAbiInput(abiJson) {
  if (typeof abiJson === "string") {
    try {
      const parsed = JSON.parse(abiJson);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Try viem's human-readable ABI format: ["function foo(uint256) view returns (uint256)"]
      return parseAbi(
        Array.isArray(abiJson) ? abiJson : [abiJson]
      );
    }
  }
  return Array.isArray(abiJson) ? abiJson : [abiJson];
}

function parseArgs(argsJson) {
  if (!argsJson || argsJson === "[]") return [];
  try {
    const parsed = JSON.parse(argsJson);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [argsJson];
  }
}

function serializeResult(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeResult);
  if (typeof value === "object" && value !== null) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeResult(v);
    }
    return out;
  }
  return value;
}

export function registerContractTools(server) {
  server.tool(
    "contract_read",
    "Call a read-only (view/pure) function on any contract on Base. Provide the ABI fragment and function name. Returns the decoded result.",
    {
      contractAddress: z.string().describe("Contract address on Base"),
      abi: z
        .string()
        .describe(
          'ABI as JSON array string (e.g. \'[{"type":"function","name":"balanceOf",...}]\') or human-readable (e.g. \'["function balanceOf(address) view returns (uint256)"]\')'
        ),
      functionName: z.string().describe("Function name to call"),
      args: z
        .string()
        .default("[]")
        .describe("Function arguments as JSON array string (e.g. '[\"0xabc...\", 100]')"),
    },
    async ({ contractAddress, abi, functionName, args }) => {
      const parsedAbi = parseAbiInput(abi);
      const parsedArgs = parseArgs(args);
      const client = getPublicClient();

      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parsedAbi,
          functionName,
          args: parsedArgs,
        });

        const serialized = serializeResult(result);
        const text = [
          `Contract read: ${functionName} on ${contractAddress}`,
          `Result: ${JSON.stringify(serialized, null, 2)}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Contract read failed: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "contract_encode",
    "Encode calldata for a contract function call on Base. Returns an encoded tx object for send_transaction. Use this for any protocol interaction not covered by specialized tools.",
    {
      contractAddress: z.string().describe("Target contract address on Base"),
      abi: z
        .string()
        .describe(
          'ABI as JSON array string or human-readable format'
        ),
      functionName: z.string().describe("Function name to encode"),
      args: z
        .string()
        .default("[]")
        .describe("Function arguments as JSON array string"),
      value: z
        .string()
        .default("0")
        .describe("ETH value to send in wei (as string). Default: 0"),
    },
    async ({ contractAddress, abi, functionName, args, value }) => {
      const parsedAbi = parseAbiInput(abi);
      const parsedArgs = parseArgs(args);

      try {
        const calldata = encodeFunctionData({
          abi: parsedAbi,
          functionName,
          args: parsedArgs,
        });

        const tx = {
          to: contractAddress,
          data: calldata,
          value,
          chainId: 8453,
        };

        const text = [
          `Encoded ${functionName} call to ${contractAddress}`,
          `  Args: ${JSON.stringify(parsedArgs)}`,
          `  Value: ${value} wei`,
          ``,
          `Call send_transaction with this tx object to execute.`,
        ].join("\n");

        return {
          content: [
            { type: "text", text },
            { type: "text", text: JSON.stringify(tx) },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Encoding failed: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
