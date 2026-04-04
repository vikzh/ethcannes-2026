#!/usr/bin/env node
/**
 * MCP client integration test -- exercises the server as a real MCP client would.
 * Tests: initialize, instructions, tools/list, prompts/list, prompts/get, tools/call.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function pass(msg) { passed++; console.log(`  PASS: ${msg}`); }
function fail(msg) { failed++; console.log(`  FAIL: ${msg}`); }
function assert(cond, msg) { cond ? pass(msg) : fail(msg); }

async function run() {
  console.log("== MCP Client Integration Tests ==\n");

  // Start the MCP server as a subprocess (same way agents do it)
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

  // --- Test 1: Instructions ---
  console.log("Phase 1: Initialize + Instructions");
  const instructions = client.getInstructions();
  assert(typeof instructions === "string" && instructions.length > 0, "instructions is a non-empty string");
  assert(instructions.includes("sign_message"), "instructions mention sign_message");
  assert(instructions.includes("get_address"), "instructions mention get_address");
  assert(instructions.includes("uniswap-swap"), "instructions mention uniswap-swap prompt");
  assert(instructions.includes("0x") || instructions.includes("unknown"), "instructions contain address or fallback");

  // --- Test 2: Tools ---
  console.log("\nPhase 2: tools/list");
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  assert(toolNames.includes("sign_message"), "tools/list includes sign_message");
  assert(toolNames.includes("get_address"), "tools/list includes get_address");

  const signTool = tools.tools.find(t => t.name === "sign_message");
  assert(signTool.inputSchema?.properties?.message, "sign_message has message parameter");
  assert(signTool.inputSchema?.properties?.chain, "sign_message has chain parameter");

  // --- Test 3: Prompts list ---
  console.log("\nPhase 3: prompts/list");
  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map(p => p.name);
  assert(promptNames.includes("uniswap-swap"), "prompts/list includes uniswap-swap");

  const swapPrompt = prompts.prompts.find(p => p.name === "uniswap-swap");
  assert(swapPrompt.description && swapPrompt.description.length > 0, "uniswap-swap has description");
  const argNames = (swapPrompt.arguments || []).map(a => a.name);
  assert(argNames.includes("tokenIn"), "uniswap-swap has tokenIn arg");
  assert(argNames.includes("tokenOut"), "uniswap-swap has tokenOut arg");
  assert(argNames.includes("amountIn"), "uniswap-swap has amountIn arg");

  // --- Test 4: Prompts get ---
  console.log("\nPhase 4: prompts/get uniswap-swap");
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
    assert(text.includes("sign_message"), "prompt message references sign_message tool");
    assert(text.includes("0x2626664c2603336E57B271c5C0b26F421741e481"), "prompt message contains router address");
  }

  // --- Test 5: Prompts get with explicit args ---
  console.log("\nPhase 5: prompts/get uniswap-swap (with arguments)");
  try {
    const argsResult = await client.getPrompt({
      name: "uniswap-swap",
      arguments: {
        tokenIn: "0x4200000000000000000000000000000000000006",
        tokenOut: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amountIn: "0.05",
      },
    });
    assert(argsResult.messages.length > 0, "prompts/get with arguments returns messages");
    const text = argsResult.messages[0]?.content?.text || "";
    assert(text.includes("0.05"), "custom amountIn reflected in prompt");
    pass("prompts/get with arguments succeeds");
  } catch (err) {
    fail(`prompts/get with arguments threw: ${err.message}`);
  }

  // --- Test 6: Tool call sign_message ---
  console.log("\nPhase 6: tools/call sign_message");
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

  // --- Test 7: Tool call get_address ---
  console.log("\nPhase 7: tools/call get_address");
  try {
    const addrResult = await client.callTool({ name: "get_address", arguments: {} });
    const addr = addrResult.content?.[0]?.text || "";
    assert(addr.startsWith("0x") && addr.length === 42, `get_address returns valid address: ${addr}`);
    pass("tools/call get_address succeeds");
  } catch (err) {
    fail(`tools/call get_address threw: ${err.message}`);
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
