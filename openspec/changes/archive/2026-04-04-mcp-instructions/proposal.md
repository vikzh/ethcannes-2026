## Why

The agent-wallet installer currently creates SKILL.md files in each agent's skill
directory to teach the agent about available MCP tools. This has three problems:

1. **Claude Coworker is broken** -- `~/.claude/skills/` is never scanned or injected.
   Skill files placed there by the installer are dead on arrival.
2. **Triple duplication** -- identical content is written to three directories
   (`~/.openclaw/skills/`, `~/.claude/skills/`, `~/.codex/skills/`).
3. **Drift risk** -- when MCP tools change, skill files can become stale if the
   installer isn't re-run.

The MCP specification provides an `instructions` field on `InitializeResult` that is
auto-delivered to the agent during the handshake. This is the correct mechanism for
telling agents how to use the server's tools. Moving instructions into the MCP server
eliminates the skill file dependency entirely.

## What Changes

- Add `instructions` string to the MCP server's `McpServer` constructor options.
  Content: wallet address (read dynamically from OWS at startup), available tools,
  chain info, security constraints.
- Remove skill file creation from the installer (`install_skill`, `remove_skill`,
  skill template, skill-related state).
- Remove skill directory paths, skill template file, and skill content tests.
- Simplify the install flow: step 8 becomes "Register MCP with agents" (no skill).
- Update management menu: remove "Reinstall skills" option, simplify to
  "Reinstall MCP" or fold into "Reinstall everything".

## Capabilities

### New Capabilities
_(none -- this modifies an existing capability)_

### Modified Capabilities
- `installer-script`: Remove skill file creation, add MCP instructions to server.
  Registration step installs MCP only (no skill file). Management menu simplified.
- `installer-testing`: Remove skill content tests, update integration tests to
  verify MCP instructions are present instead of skill files.

## Impact

- **installer/mcp-server/index.js**: Add `instructions` option with dynamic content
- **installer/lib/functions.sh**: Remove `install_skill`, `remove_skill`,
  `get_skill_dir`, `build_agents_json` skill path references. Simplify install flow.
- **installer/lib/skill-template.md**: Delete file
- **installer/install.sh**: Simplify step 8, remove skill references from state
- **installer/tests/**: Remove `test_skill_content.sh`, update integration and
  management tests
- **No agent config changes**: MCP registration is unchanged
- **No OWS changes**: Wallet, policy, key creation unchanged
