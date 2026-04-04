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

### Requirement: MCP server unit tests
Tests SHALL verify the MCP server responds correctly to JSON-RPC calls.

#### Scenario: tools/list returns sign_message
- **WHEN** `tools/list` JSON-RPC request is piped to the MCP server
- **THEN** response includes a tool named `sign_message` with correct input schema

#### Scenario: sign_message returns signature with mock OWS
- **WHEN** `tools/call` with `sign_message` is piped to MCP server in sandbox
- **THEN** response contains a signature string
- **AND** `$MOCK_OWS_LOG` shows `sign message` was called

#### Scenario: Initialize returns instructions
- **WHEN** `initialize` JSON-RPC request is sent to MCP server
- **THEN** response contains `instructions` field
- **AND** instructions mention `sign_message` and `get_address`

---

### Requirement: MCP registration tests
Tests SHALL verify MCP config is written for each agent type.

#### Scenario: OpenClaw MCP registered
- **WHEN** `register_mcp_openclaw` runs
- **THEN** `~/.openclaw/openclaw.json` contains `agent-wallet` MCP server config

#### Scenario: Claude Coworker MCP registered
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
