## 1. MCP server: add instructions

- [x] 1.1 Add `resolveWalletAddress()` function to `index.js` -- reads address from `ows wallet list` at startup
- [x] 1.2 Add `instructions` option to `McpServer` constructor with dynamic wallet address, chain info, tool guidance
- [x] 1.3 Verify: `initialize` response includes `instructions` field

## 2. Remove skill file machinery from functions.sh

- [x] 2.1 Remove `SKILL_PATH_OPENCLAW`, `SKILL_PATH_CLAUDE`, `SKILL_PATH_CODEX` constants
- [x] 2.2 Remove `get_skill_dir`, `install_skill`, `remove_skill`, `build_agents_json` functions
- [x] 2.3 Remove `get_agent_display_name` if unused after cleanup (check references)
- [x] 2.4 Delete `installer/lib/skill-template.md`

## 3. Update install.sh

- [x] 3.1 Step 8: remove `install_skill` calls, keep only `register_mcp` per agent
- [x] 3.2 Simplify state write: `installed_agents` becomes a JSON array of agent type strings
- [x] 3.3 Update management menu label: [4] "Reinstall MCP" instead of "Reinstall skills"
- [x] 3.4 Update `reinstall_skills` -> `reinstall_mcp` (deregister + re-register)
- [x] 3.5 Update `do_uninstall_cleanup`: remove skill directory cleanup, keep MCP deregister

## 4. Update state.sh

- [x] 4.1 Update `write_state` and related functions for simplified `installed_agents` format

## 5. Update tests

- [x] 5.1 Delete `test_skill_content.sh`
- [x] 5.2 Update `test_agents.sh`: remove skill file assertions, keep MCP registration tests
- [x] 5.3 Update `test_integration.sh`: remove skill file assertions, add assertion that no skill files exist
- [x] 5.4 Update `test_management.sh`: update reinstall_skills -> reinstall_mcp assertions
- [x] 5.5 Update `test_state.sh` for simplified installed_agents format
- [x] 5.6 Add MCP instructions test: verify initialize response includes instructions

## 6. Update self-test

- [x] 6.1 Remove skill file checks from self-test
- [x] 6.2 Add MCP instructions check: verify instructions in initialize response

## 7. Validation

- [x] 7.1 Run `./installer/tests/run-tests.sh` -- all pass
- [x] 7.2 Run `./installer/install.sh --self-test` -- all pass
- [x] 7.3 Run `./installer/install.sh --reinstall` -- verify clean install, MCP signing works
- [x] 7.4 Verify `openclaw mcp show agent-wallet` still works
- [x] 7.5 E2E: OpenClaw signs dummy payload via MCP
