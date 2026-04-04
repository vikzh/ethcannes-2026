## 1. Scaffold (done)

- [x] 1.1 Create `installer/` directory structure
- [x] 1.2 Create all lib files, test files, mock files
- [x] 1.3 Make scripts executable

## 2. Templates (done)

- [x] 2.1 Write `lib/policy-template.json`
- [ ] 2.2 Update `lib/skill-template.md` -- describe MCP tools (`sign_message`) not OWS CLI commands. Remove any `ows sign` or `OWS_PASSPHRASE` references. Add MCP tool parameter descriptions.

## 3. TUI helpers (done)

- [x] 3.1-3.6 All TUI helpers implemented

## 4. State management (done)

- [x] 4.1-4.5 All state functions implemented

## 5. MCP Server

- [ ] 5.1 Create `installer/mcp-server/package.json` with deps: `@modelcontextprotocol/sdk`
- [ ] 5.2 Write `installer/mcp-server/index.js` -- MCP server with `sign_message` tool: reads `AGENT_WALLET_NAME` from env, reads API key from `~/.ows/<name>.key`, spawns `ows sign message` with key as `OWS_PASSPHRASE`, returns signature
- [ ] 5.3 Run `npm install` in `mcp-server/` to verify deps resolve

**Verify**: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node installer/mcp-server/index.js` returns tool list including `sign_message`.

## 6. Core functions -- MCP registration

- [x] 6.1-6.8 Existing wallet/policy/key/detect functions (done)
- [ ] 6.9 Write `register_mcp_openclaw` -- runs `openclaw mcp set agent-wallet '<json>'` with the MCP server config
- [ ] 6.10 Write `register_mcp_claude` -- runs `claude mcp add agent-wallet --transport stdio --scope user -- node <path>` if `claude` in PATH, else writes to `~/.claude.json` directly
- [ ] 6.11 Write `register_mcp_codex` -- appends `[mcp_servers.agent-wallet]` to `~/.codex/config.toml`
- [ ] 6.12 Write `register_mcp` -- dispatches to per-agent registration based on agent type
- [ ] 6.13 Write `deregister_mcp_openclaw`, `deregister_mcp_claude`, `deregister_mcp_codex` -- removes MCP config per agent
- [ ] 6.14 Write `check_node_installed` -- verifies `node` in PATH
- [ ] 6.15 Write `install_mcp_deps` -- runs `npm install` in the mcp-server directory
- [ ] 6.16 Update `install_skill` to write MCP-aware skill content (not OWS CLI instructions)

## 7. Main script updates

- [x] 7.1-7.6 Existing install.sh flow (done)
- [ ] 7.7 Add Node.js check step to first-run flow (after OWS, before wallet)
- [ ] 7.8 Add MCP server npm install step to first-run flow
- [ ] 7.9 Replace skill-only installation with MCP registration + skill installation per agent
- [ ] 7.10 Update `--reinstall` to deregister MCP from all agents during cleanup
- [ ] 7.11 Update `do_uninstall_cleanup` to deregister MCP from all agents
- [ ] 7.12 Update management menu "Reinstall MCP + skills" option

## 8. Test mocks (done)

- [x] 8.1-8.6 Existing mocks and helpers

## 9. Update tests for MCP

- [ ] 9.1 Add MCP server unit test: start server, send `tools/list`, verify `sign_message` tool present
- [ ] 9.2 Add MCP signing test: send `sign_message` tool call via JSON-RPC, verify signature returned (requires real OWS or mock)
- [ ] 9.3 Update `test_agents.sh` to verify MCP registration per agent type
- [ ] 9.4 Update `test_integration.sh` to verify MCP config created for each agent
- [ ] 9.5 Update `test_management.sh` to verify MCP deregistration on uninstall
- [ ] 9.6 Update skill content test to verify MCP tool descriptions, no `ows` references

## 10. Self-test updates

- [ ] 10.1 Update `--self-test` to verify MCP server can start and list tools
- [ ] 10.2 Update `--self-test` to call `sign_message` via MCP JSON-RPC pipe (replace direct `ows sign` test)
- [ ] 10.3 Update `--self-test` reinstall phase to verify MCP works after reinstall

## 11. Final validation

- [ ] 11.1 Run `./installer/tests/run-tests.sh` -- all pass
- [ ] 11.2 Run `./installer/install.sh --self-test` -- all pass including MCP signing
- [ ] 11.3 Run `./installer/install.sh --reinstall` -- verify MCP registered, signing works
- [ ] 11.4 Verify `openclaw mcp list` shows `agent-wallet` after install
- [ ] 11.5 Verify `~/.claude.json` or Claude MCP config contains `agent-wallet` after install
