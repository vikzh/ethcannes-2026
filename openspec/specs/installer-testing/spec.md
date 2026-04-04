## ADDED Requirements

### Requirement: Test harness location and runner
All tests at `installer/tests/`. Runner `run-tests.sh` executes `test_*.sh` files.

#### Scenario: All pass
- **WHEN** all tests pass
- **THEN** prints "N/N tests passed", exits 0

#### Scenario: Some fail
- **WHEN** failures occur
- **THEN** prints "M/N passed, K failed" with names, exits 1

---

### Requirement: Sandboxed test environment
Each test uses isolated temp HOME. No real filesystem touched.

#### Scenario: Sandbox isolation
- **WHEN** test runs
- **THEN** all files created under `$FAKE_HOME`, cleaned up on exit

---

### Requirement: OWS CLI mock
Mock at `tests/mocks/ows`. Deterministic output, recorded invocations, failure simulation.

#### Scenario: Mock records calls
- **WHEN** ows commands run
- **THEN** `$MOCK_OWS_LOG` has one line per call

---

### Requirement: MCP server integration tests
Tests SHALL verify the MCP server responds correctly via the MCP Client SDK
(`test-client.js`). Tests cover initialization, tool registration, prompt
handling, tool invocation, and DeFi encoding.

#### Scenario: Initialize returns instructions with full tool catalog
- **WHEN** a client connects and reads instructions
- **THEN** instructions are a non-empty string mentioning `sign_message`,
  `get_address`, `uniswap_swap`, `aave_supply`, `send_transaction`,
  `get_balance`, `approve_erc20`, and `contract_read`

#### Scenario: tools/list returns all 20 tools
- **WHEN** `tools/list` is called
- **THEN** response includes at least 18 tools: `sign_message`, `get_address`,
  `uniswap_swap`, `uniswap_quote`, `aave_supply`, `aave_withdraw`, `aave_borrow`,
  `aave_repay`, `aave_get_user_data`, `aave_get_reserves`, `get_balance`,
  `get_token_info`, `approve_erc20`, `transfer_erc20`, `contract_read`,
  `contract_encode`, `send_transaction`, `get_transaction`
- **AND** each tool has correct input schema (verified for sign_message,
  uniswap_swap, aave_supply, send_transaction, contract_read)

#### Scenario: Legacy uniswap-swap prompt is deprecated
- **WHEN** `prompts/list` is called
- **THEN** `uniswap-swap` prompt exists with `[DEPRECATED]` in description
- **AND** `prompts/get` returns a message containing `uniswap-v3-swap` and deprecation notice

#### Scenario: sign_message returns signature
- **WHEN** `tools/call` with `sign_message` is invoked
- **THEN** response contains a hex signature string of at least 128 characters

#### Scenario: get_address returns valid address
- **WHEN** `tools/call` with `get_address` is invoked
- **THEN** response contains a valid `0x`-prefixed 42-character address

#### Scenario: DeFi tool encoding (pure, no RPC)
- **WHEN** `approve_erc20`, `transfer_erc20`, `contract_encode`, `aave_supply`,
  `aave_borrow` are invoked with valid parameters
- **THEN** each returns a preview text and encoded tx object with `to`, `data`,
  and `chainId: 8453`

#### Scenario: uniswap_swap encoding
- **WHEN** `uniswap_swap` is invoked with WETH->USDC 0.01
- **THEN** response includes preview text and encoded tx targeting the Uniswap V3 Router

---

### Requirement: MCP registration tests
Tests SHALL verify MCP config is written for each agent type.

#### Scenario: OpenClaw MCP registered
- **WHEN** `register_mcp_openclaw` runs
- **THEN** `~/.openclaw/openclaw.json` contains `agent-wallet` MCP server config

#### Scenario: Claude Code/Cowork MCP registered
- **WHEN** `register_mcp_claude` runs
- **THEN** `~/.claude.json` contains `agent-wallet` in `mcpServers`

#### Scenario: Codex MCP registered
- **WHEN** `register_mcp_codex` runs
- **THEN** `~/.codex/config.toml` contains `[mcp_servers.agent-wallet]`

---

### Requirement: MCP deregistration tests
Verify uninstall removes MCP config only (no skill directory cleanup needed).

#### Scenario: Uninstall removes MCP from all agents
- **WHEN** `do_uninstall_cleanup` runs
- **THEN** MCP config entries for `agent-wallet` are gone from all agent configs

---

### Requirement: Integration test -- full happy path
End-to-end test: install with all 3 agents mocked, verify wallet, policy, key,
MCP config per agent, state file, output address. No skill files should exist
after install.

#### Scenario: Full happy path
- **WHEN** all agents mocked, non-interactive
- **THEN** all artifacts created, MCP registered for each agent

#### Scenario: No skill files created
- **WHEN** full install completes
- **THEN** no `SKILL.md` files exist in agent skill directories
- **AND** MCP is registered for all detected agents

---

### Requirement: Self-test with MCP signing
`--self-test` SHALL verify agent signing works via MCP (not direct `ows` call).
Self-test SHALL also verify MCP instructions are present in initialize response.

#### Scenario: MCP signing in self-test
- **WHEN** self-test runs
- **THEN** MCP server starts, `sign_message` tool call returns valid signature

#### Scenario: Instructions present in self-test
- **WHEN** self-test sends `initialize` request
- **THEN** response includes `instructions` field with wallet address

---

### Requirement: Reinstall test with MCP
Test SHALL verify `--reinstall` deregisters old MCP, installs fresh, signing works.

#### Scenario: Reinstall with MCP
- **WHEN** `--reinstall` runs
- **THEN** old MCP config removed, new install works, signing via MCP works
