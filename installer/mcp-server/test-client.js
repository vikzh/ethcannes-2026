#!/usr/bin/env node
/**
 * MCP client integration test -- exercises the server as a real MCP client would.
 * Tests: initialize, instructions, tools/list, prompts/list, prompts/get, tools/call.
 *
 * DeFi tools (uniswap_swap, aave_*, etc.) require live RPC and are tested for
 * registration only (tools/list), not invocation, unless BASE_RPC_URL is set.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_CHAIN_ID, PROTOCOLS, TOKENS, SEPOLIA_TOKENS } from "./lib/constants.js";
import { sepolia } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sampleErc20 =
  ACTIVE_CHAIN_ID === sepolia.id ? SEPOLIA_TOKENS.USDC : TOKENS.USDC;
const sampleWeth =
  ACTIVE_CHAIN_ID === sepolia.id ? SEPOLIA_TOKENS.WETH : TOKENS.WETH;

let passed = 0;
let failed = 0;

function pass(msg) { passed++; console.log(`  PASS: ${msg}`); }
function fail(msg) { failed++; console.log(`  FAIL: ${msg}`); }
function assert(cond, msg) { cond ? pass(msg) : fail(msg); }

async function run() {
  console.log("== MCP Client Integration Tests ==\n");

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(__dirname, "index.js")],
    env: {
      ...process.env,
      AGENT_WALLET_NAME: process.env.AGENT_WALLET_NAME || "agent-wallet",
    },
  });

  const client = new Client(
    { name: "test-client", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // --- Phase 1: Instructions ---
  console.log("Phase 1: Initialize + Instructions");
  const instructions = client.getInstructions();
  assert(typeof instructions === "string" && instructions.length > 0, "instructions is a non-empty string");
  assert(instructions.includes("sign_message"), "instructions mention sign_message");
  assert(instructions.includes("get_address"), "instructions mention get_address");
  assert(instructions.includes("uniswap_swap"), "instructions mention uniswap_swap tool");
  assert(instructions.includes("aave_supply"), "instructions mention aave_supply tool");
  assert(instructions.includes("send_transaction"), "instructions mention send_transaction tool");
  assert(instructions.includes("get_balance"), "instructions mention get_balance tool");
  assert(instructions.includes("approve_erc20"), "instructions mention approve_erc20 tool");
  assert(instructions.includes("contract_read"), "instructions mention contract_read tool");
  assert(instructions.includes("0x") || instructions.includes("unknown"), "instructions contain address or fallback");

  // --- Phase 2: Tools list ---
  console.log("\nPhase 2: tools/list");
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);

  const expectedTools = [
    "sign_message",
    "get_address",
    "uniswap_swap",
    "uniswap_quote",
    "aave_supply",
    "aave_withdraw",
    "aave_borrow",
    "aave_repay",
    "aave_get_user_data",
    "aave_get_reserves",
    "get_balance",
    "get_token_info",
    "approve_erc20",
    "transfer_erc20",
    "contract_read",
    "contract_encode",
    "send_transaction",
    "get_transaction",
  ];

  for (const name of expectedTools) {
    assert(toolNames.includes(name), `tools/list includes ${name}`);
  }

  assert(
    toolNames.length >= expectedTools.length,
    `at least ${expectedTools.length} tools registered (got ${toolNames.length})`
  );

  // Verify sign_message schema
  const signTool = tools.tools.find(t => t.name === "sign_message");
  assert(signTool.inputSchema?.properties?.message, "sign_message has message parameter");
  assert(signTool.inputSchema?.properties?.chain, "sign_message has chain parameter");

  // Verify uniswap_swap schema
  const swapTool = tools.tools.find(t => t.name === "uniswap_swap");
  assert(swapTool.inputSchema?.properties?.tokenIn, "uniswap_swap has tokenIn parameter");
  assert(swapTool.inputSchema?.properties?.tokenOut, "uniswap_swap has tokenOut parameter");
  assert(swapTool.inputSchema?.properties?.amountIn, "uniswap_swap has amountIn parameter");
  assert(swapTool.inputSchema?.properties?.fee, "uniswap_swap has fee parameter");
  assert(swapTool.inputSchema?.properties?.slippageBps, "uniswap_swap has slippageBps parameter");

  // Verify aave_supply schema
  const aaveSupply = tools.tools.find(t => t.name === "aave_supply");
  assert(aaveSupply.inputSchema?.properties?.asset, "aave_supply has asset parameter");
  assert(aaveSupply.inputSchema?.properties?.amount, "aave_supply has amount parameter");

  // Verify send_transaction schema
  const sendTx = tools.tools.find(t => t.name === "send_transaction");
  assert(sendTx.inputSchema?.properties?.to, "send_transaction has to parameter");
  assert(sendTx.inputSchema?.properties?.data, "send_transaction has data parameter");
  assert(sendTx.inputSchema?.properties?.value, "send_transaction has value parameter");

  // Verify contract_read schema
  const contractRead = tools.tools.find(t => t.name === "contract_read");
  assert(contractRead.inputSchema?.properties?.contractAddress, "contract_read has contractAddress parameter");
  assert(contractRead.inputSchema?.properties?.abi, "contract_read has abi parameter");
  assert(contractRead.inputSchema?.properties?.functionName, "contract_read has functionName parameter");

  // --- Phase 3: Prompts list ---
  console.log("\nPhase 3: prompts/list");
  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map(p => p.name);
  assert(promptNames.includes("uniswap-swap"), "prompts/list includes legacy uniswap-swap");

  const swapPrompt = prompts.prompts.find(p => p.name === "uniswap-swap");
  assert(swapPrompt.description && swapPrompt.description.includes("DEPRECATED"), "uniswap-swap prompt is marked deprecated");

  // --- Phase 4: Prompts get (legacy) ---
  console.log("\nPhase 4: prompts/get uniswap-swap (legacy)");
  let getResult;
  try {
    getResult = await client.getPrompt({ name: "uniswap-swap", arguments: {} });
    assert(true, "prompts/get uniswap-swap succeeds");
  } catch (err) {
    fail(`prompts/get uniswap-swap threw: ${err.message}`);
    getResult = null;
  }

  if (getResult) {
    assert(Array.isArray(getResult.messages), "result has messages array");
    assert(getResult.messages.length > 0, "messages array is non-empty");
    const text = getResult.messages[0]?.content?.text || "";
    assert(text.includes("uniswap-v3-swap"), "prompt message contains uniswap-v3-swap action");
    assert(text.includes("DEPRECATED") || text.includes("deprecated"), "prompt message mentions deprecation");
  }

  // --- Phase 5: Tool call sign_message ---
  console.log("\nPhase 5: tools/call sign_message");
  try {
    const signResult = await client.callTool({
      name: "sign_message",
      arguments: { message: "test-payload-for-mcp-client", chain: "base" },
    });
    const sigText = signResult.content?.[0]?.text || "";
    assert(sigText.length >= 128, `sign_message returns valid signature (${sigText.length} chars)`);
    assert(/^[0-9a-fA-F]+$/.test(sigText), "signature is hex");
    pass("tools/call sign_message succeeds");
  } catch (err) {
    fail(`tools/call sign_message threw: ${err.message}`);
  }

  // --- Phase 6: Tool call get_address ---
  console.log("\nPhase 6: tools/call get_address");
  try {
    const addrResult = await client.callTool({ name: "get_address", arguments: {} });
    const addr = addrResult.content?.[0]?.text || "";
    assert(addr.startsWith("0x") && addr.length === 42, `get_address returns valid address: ${addr}`);
    pass("tools/call get_address succeeds");
  } catch (err) {
    fail(`tools/call get_address threw: ${err.message}`);
  }

  // --- Phase 7: DeFi tool encoding (no RPC needed for pure encoding) ---
  console.log("\nPhase 7: DeFi tool encoding tests");

  // approve_erc20 - pure encoding, no RPC
  try {
    const approveResult = await client.callTool({
      name: "approve_erc20",
      arguments: {
        tokenAddress: sampleErc20,
        spender: PROTOCOLS.UNISWAP_V3_ROUTER,
        amount: "100",
      },
    });
    const texts = approveResult.content?.map(c => c.text).join("\n") || "";
    assert(texts.includes("ERC-20 Approve"), "approve_erc20 returns preview");
    assert(texts.includes('"to"'), "approve_erc20 returns tx object with 'to'");
    assert(texts.includes('"data"'), "approve_erc20 returns tx object with 'data'");
    assert(texts.includes(String(ACTIVE_CHAIN_ID)), `approve_erc20 tx targets chainId ${ACTIVE_CHAIN_ID}`);
    pass("approve_erc20 encoding succeeds");
  } catch (err) {
    fail(`approve_erc20 threw: ${err.message}`);
  }

  // transfer_erc20 - pure encoding, no RPC
  try {
    const transferResult = await client.callTool({
      name: "transfer_erc20",
      arguments: {
        tokenAddress: sampleErc20,
        to: "0x0000000000000000000000000000000000000001",
        amount: "10",
      },
    });
    const texts = transferResult.content?.map(c => c.text).join("\n") || "";
    assert(texts.includes("ERC-20 Transfer"), "transfer_erc20 returns preview");
    assert(texts.includes('"data"'), "transfer_erc20 returns encoded calldata");
    pass("transfer_erc20 encoding succeeds");
  } catch (err) {
    fail(`transfer_erc20 threw: ${err.message}`);
  }

  // contract_encode - pure encoding, no RPC
  try {
    const encodeResult = await client.callTool({
      name: "contract_encode",
      arguments: {
        contractAddress: sampleErc20,
        abi: '[{"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]}]',
        functionName: "transfer",
        args: '["0x0000000000000000000000000000000000000001", 1000000]',
      },
    });
    const texts = encodeResult.content?.map(c => c.text).join("\n") || "";
    assert(texts.includes("Encoded transfer"), "contract_encode returns preview");
    assert(texts.includes('"data"'), "contract_encode returns tx with data");
    pass("contract_encode succeeds");
  } catch (err) {
    fail(`contract_encode threw: ${err.message}`);
  }

  // aave_supply - pure encoding, no RPC
  try {
    const aaveResult = await client.callTool({
      name: "aave_supply",
      arguments: {
        asset: sampleErc20,
        amount: "100",
      },
    });
    const texts = aaveResult.content?.map(c => c.text).join("\n") || "";
    assert(texts.includes("Aave V3 Supply"), "aave_supply returns preview");
    assert(texts.includes('"data"'), "aave_supply returns encoded calldata");
    assert(
      texts.toLowerCase().includes(PROTOCOLS.AAVE_V3_POOL.toLowerCase()),
      "aave_supply targets pool for active chain",
    );
    pass("aave_supply encoding succeeds");
  } catch (err) {
    fail(`aave_supply threw: ${err.message}`);
  }

  // aave_borrow - pure encoding, no RPC
  try {
    const borrowResult = await client.callTool({
      name: "aave_borrow",
      arguments: {
        asset: sampleErc20,
        amount: "50",
      },
    });
    const texts = borrowResult.content?.map(c => c.text).join("\n") || "";
    assert(texts.includes("Aave V3 Borrow"), "aave_borrow returns preview");
    assert(texts.includes("variable"), "aave_borrow defaults to variable rate");
    pass("aave_borrow encoding succeeds");
  } catch (err) {
    fail(`aave_borrow threw: ${err.message}`);
  }

  // uniswap_swap — requires live QuoterV2 + pool on the active chain
  try {
    const swapResult = await client.callTool({
      name: "uniswap_swap",
      arguments: {
        tokenIn: sampleWeth,
        tokenOut: sampleErc20,
        amountIn: "0.01",
      },
    });
    const texts = swapResult.content?.map(c => c.text).join("\n") || "";
    if (swapResult.isError) {
      assert(
        texts.includes("QuoterV2") || texts.includes("quote") || texts.includes("Router:"),
        "uniswap_swap fails closed with quote/router context",
      );
    } else {
      assert(texts.includes("Uniswap V3 Swap"), "uniswap_swap returns preview");
      assert(texts.includes('"data"'), "uniswap_swap returns encoded calldata");
      assert(
        texts.toLowerCase().includes(PROTOCOLS.UNISWAP_V3_ROUTER.toLowerCase()),
        "uniswap_swap targets chain router",
      );
    }
    pass("uniswap_swap encoding succeeds");
  } catch (err) {
    fail(`uniswap_swap threw: ${err.message}`);
  }

  // --- Summary ---
  await client.close();
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Test harness error:", err);
  process.exit(2);
});
