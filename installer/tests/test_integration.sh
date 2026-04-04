#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"

printf "== test_integration ==\n"

# Test: Full first-run happy path (non-interactive)
setup_sandbox
mock_openclaw
mock_claude
mock_codex

# Run the installer
set +e
output=$(bash "${INSTALLER_DIR}/install.sh" 2>&1)
rc=$?
set -e

assert_equals "0" "$rc" "Installer exits 0 on happy path"

# Verify wallet created (may not be first log line due to version check)
assert_file_contains "$MOCK_OWS_LOG" "wallet create" "OWS wallet create was called"

# Verify policy
assert_file_contains "$MOCK_OWS_LOG" "policy" "Policy operation was called"

# Verify API key
assert_file_contains "$MOCK_OWS_LOG" "key create" "API key was created"

# Verify key file
key_file="${HOME}/.ows/agent-wallet.key"
assert_file_exists "$key_file" "Key file created"
assert_file_perms "$key_file" "600" "Key file has 0600 perms"

# Verify state file
assert_file_exists "${HOME}/.ows/agent-installer.json" "State file created"
assert_json_field "${HOME}/.ows/agent-installer.json" "wallet_name" "agent-wallet" "State has correct wallet name"
assert_json_field "${HOME}/.ows/agent-installer.json" "version" "0.1.0" "State has version"

# Verify installed_agents is a simple string array (not objects with paths)
set +e
python3 -c "
import json
with open('${HOME}/.ows/agent-installer.json') as f:
    data = json.load(f)
agents = data['installed_agents']
assert isinstance(agents, list), 'should be a list'
assert all(isinstance(a, str) for a in agents), 'should be strings not objects'
" 2>/dev/null
rc_state=$?
set -e
assert_equals "0" "$rc_state" "installed_agents is a string array"

# Verify output contains address
echo "$output" | grep -q "0xA0E41234567890abcdef1234567890abcdef1234"
rc=$?
assert_equals "0" "$rc" "Output contains agent address"

# Verify MCP registration for agents
assert_file_exists "${HOME}/.openclaw/openclaw.json" "OpenClaw MCP config created during install"
assert_file_contains "${HOME}/.openclaw/openclaw.json" "agent-wallet" "OpenClaw MCP has agent-wallet"
# Verify OpenClaw uses correct key path (mcp.servers, not mcpServers)
assert_file_not_contains "${HOME}/.openclaw/openclaw.json" "mcpServers" "OpenClaw config does not use mcpServers key"
assert_file_exists "${HOME}/.codex/config.toml" "Codex MCP config created during install"
assert_file_contains "${HOME}/.codex/config.toml" "mcp_servers.agent-wallet" "Codex MCP has agent-wallet section"

# Verify no agent CLI output leaked into installer output
set +e
echo "$output" | grep -qi "lobster\|🦞"
rc_leak=$?
set -e
assert_equals "1" "$rc_leak" "No agent CLI banner leaked into output"

# Verify no skill files were created (MCP only)
assert_file_not_exists "${HOME}/.openclaw/skills/agent-wallet/SKILL.md" "No OpenClaw skill file created"
assert_file_not_exists "${HOME}/.claude/skills/agent-wallet/SKILL.md" "No Claude skill file created"
assert_file_not_exists "${HOME}/.codex/skills/agent-wallet/SKILL.md" "No Codex skill file created"

teardown_sandbox

# Test: Platform rejection (exit code 1)
setup_sandbox
export MOCK_UNAME_OUTPUT="Linux"
set +e
bash "${INSTALLER_DIR}/install.sh" 2>/dev/null
rc=$?
set -e
assert_equals "1" "$rc" "Installer exits 1 on non-macOS platform"
teardown_sandbox

# Test: Wallet creation failure (exit code 3)
setup_sandbox
mock_openclaw
export MOCK_OWS_FAIL="wallet create"
set +e
bash "${INSTALLER_DIR}/install.sh" 2>/dev/null
rc=$?
set -e
assert_equals "3" "$rc" "Installer exits 3 on wallet creation failure"
teardown_sandbox

# Test: API key creation failure (exit code 4)
setup_sandbox
mock_openclaw
export MOCK_OWS_FAIL="key create"
set +e
bash "${INSTALLER_DIR}/install.sh" 2>/dev/null
rc=$?
set -e
assert_equals "4" "$rc" "Installer exits 4 on API key creation failure"
teardown_sandbox

test_summary
