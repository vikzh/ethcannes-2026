#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"
source "${INSTALLER_DIR}/lib/ui.sh"
source "${INSTALLER_DIR}/lib/state.sh"
source "${INSTALLER_DIR}/lib/functions.sh"

printf "== test_management ==\n"

# Test: show_status outputs expected fields
setup_sandbox
setup_existing_install "agent-wallet"
set +e
output=$(show_status 2>&1)
rc_show=$?
set -e
echo "$output" | grep -q "agent-wallet"
rc=$?
assert_equals "0" "$rc" "show_status contains wallet name"
echo "$output" | grep -q "0xA0E4"
rc=$?
assert_equals "0" "$rc" "show_status contains agent address"
teardown_sandbox

# Test: regenerate_key revokes old and creates new
setup_sandbox
setup_existing_install "agent-wallet"
set +e
regenerate_key < /dev/null 2>/dev/null
set -e
# Check mock log for revoke and create
assert_file_contains "$MOCK_OWS_LOG" "key revoke" "regenerate_key revokes old key"
assert_file_contains "$MOCK_OWS_LOG" "key create" "regenerate_key creates new key"
# Check key file still has correct perms
assert_file_perms "${HOME}/.ows/agent-wallet.key" "600" "Key file perms preserved after regeneration"
teardown_sandbox

# Test: full_uninstall removes everything
setup_sandbox
setup_existing_install "agent-wallet"
mock_openclaw
# Create MCP config to verify it gets cleaned up
register_mcp "openclaw" "agent-wallet" 2>/dev/null
assert_file_exists "${HOME}/.openclaw/openclaw.json" "MCP config exists before uninstall"
# Non-interactive mode does uninstall without prompt
set +e
full_uninstall < /dev/null 2>/dev/null
set -e
assert_file_not_exists "${HOME}/.ows/agent-installer.json" "State file removed after uninstall"
assert_file_not_exists "${HOME}/.ows/agent-wallet.key" "Key file removed after uninstall"
assert_file_contains "$MOCK_OWS_LOG" "key revoke" "Uninstall revokes API key"
assert_file_contains "$MOCK_OWS_LOG" "policy delete" "Uninstall deletes policy"
assert_file_contains "$MOCK_OWS_LOG" "wallet delete" "Uninstall deletes wallet"
# Verify MCP deregistered (correct key path: mcp.servers)
set +e
python3 -c "
import json
with open('${HOME}/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
servers = cfg.get('mcp', {}).get('servers', {})
assert 'agent-wallet' not in servers
" 2>/dev/null
rc_mcp=$?
set -e
assert_equals "0" "$rc_mcp" "MCP deregistered from OpenClaw after uninstall"
teardown_sandbox

# Test: reinstall_mcp re-registers MCP for detected agents
setup_sandbox
setup_existing_install "agent-wallet"
mock_openclaw
mock_codex
set +e
reinstall_mcp < /dev/null 2>/dev/null
set -e
assert_file_exists "${HOME}/.openclaw/openclaw.json" "OpenClaw MCP re-registered"
assert_file_exists "${HOME}/.codex/config.toml" "Codex MCP registered"
assert_file_contains "${HOME}/.codex/config.toml" "mcp_servers.agent-wallet" "Codex TOML has MCP section after reinstall"
teardown_sandbox

test_summary
