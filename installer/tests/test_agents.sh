#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"
source "${INSTALLER_DIR}/lib/ui.sh"
source "${INSTALLER_DIR}/lib/state.sh"
source "${INSTALLER_DIR}/lib/functions.sh"

printf "== test_agents ==\n"

# Test: detect_agents with all three
setup_sandbox
mock_openclaw
mock_claude
mock_codex
agents=$(detect_agents)
assert_equals "openclaw claude codex" "$agents" "detect_agents finds all three agents"
teardown_sandbox

# Test: detect_agents with two
setup_sandbox
mock_openclaw
mock_codex
agents=$(detect_agents)
assert_equals "openclaw codex" "$agents" "detect_agents finds openclaw and codex"
teardown_sandbox

# Test: detect_agents with none
setup_sandbox
mock_no_agents
agents=$(detect_agents)
assert_equals "" "$agents" "detect_agents finds no agents"
teardown_sandbox

# Test: detect_agents with directory only (no binary)
setup_sandbox
mock_no_agents
mkdir -p "${HOME}/.claude"
agents=$(detect_agents)
assert_equals "claude" "$agents" "detect_agents finds Claude Code/Cowork via directory"
teardown_sandbox

# Test: register_mcp_openclaw writes config with correct key path (mcp.servers, not mcpServers)
setup_sandbox
mock_openclaw
register_mcp "openclaw" "test-wallet" 2>/dev/null
assert_file_exists "${HOME}/.openclaw/openclaw.json" "OpenClaw MCP config created"
assert_file_contains "${HOME}/.openclaw/openclaw.json" "agent-wallet" "OpenClaw MCP config has agent-wallet server"
assert_file_contains "${HOME}/.openclaw/openclaw.json" "AGENT_WALLET_NAME" "OpenClaw MCP config has wallet name env"
# Verify correct key path: "mcp" -> "servers" (not "mcpServers")
set +e
python3 -c "
import json
with open('${HOME}/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
assert 'mcpServers' not in cfg, 'should not use mcpServers key'
assert 'agent-wallet' in cfg['mcp']['servers'], 'should be in mcp.servers'
" 2>/dev/null
rc=$?
set -e
assert_equals "0" "$rc" "OpenClaw config uses mcp.servers (not mcpServers)"
teardown_sandbox

# Test: register_mcp_openclaw does not leak CLI stdout
setup_sandbox
mock_openclaw
output=$(register_mcp "openclaw" "test-wallet" 2>&1)
set +e
echo "$output" | grep -qi "openclaw"
rc=$?
set -e
assert_equals "1" "$rc" "OpenClaw CLI output suppressed during MCP registration"
teardown_sandbox

# Test: register_mcp_codex writes TOML config
setup_sandbox
mock_codex
register_mcp "codex" "test-wallet" 2>/dev/null
assert_file_exists "${HOME}/.codex/config.toml" "Codex MCP config created"
assert_file_contains "${HOME}/.codex/config.toml" "mcp_servers.agent-wallet" "Codex TOML has MCP section"
assert_file_contains "${HOME}/.codex/config.toml" "AGENT_WALLET_NAME" "Codex TOML has wallet name env"
teardown_sandbox

# Test: build_agents_json produces simple string array (no paths)
setup_sandbox
json=$(build_agents_json "openclaw codex")
assert_equals '["openclaw","codex"]' "$json" "build_agents_json produces string array"
teardown_sandbox

# Test: deregister_mcp_openclaw removes config
setup_sandbox
mock_openclaw
register_mcp "openclaw" "test-wallet" 2>/dev/null
deregister_mcp "openclaw" 2>/dev/null
# After deregister, agent-wallet should be removed from mcp.servers
set +e
python3 -c "
import json
with open('${HOME}/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
servers = cfg.get('mcp', {}).get('servers', {})
assert 'agent-wallet' not in servers
" 2>/dev/null
rc=$?
set -e
assert_equals "0" "$rc" "OpenClaw MCP config removed after deregister"
teardown_sandbox

# Test: deregister_mcp_codex removes TOML section
setup_sandbox
mock_codex
register_mcp "codex" "test-wallet" 2>/dev/null
deregister_mcp "codex" 2>/dev/null
assert_file_not_contains "${HOME}/.codex/config.toml" "mcp_servers.agent-wallet" "Codex TOML MCP section removed after deregister"
teardown_sandbox

test_summary
