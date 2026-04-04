#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"
source "${INSTALLER_DIR}/lib/ui.sh"
source "${INSTALLER_DIR}/lib/state.sh"
source "${INSTALLER_DIR}/lib/functions.sh"

printf "== test_state ==\n"

# Test: write_state then read_state roundtrip
setup_sandbox
write_state "my-wallet" "0xABCD" "test-policy" "test-key" '["eip155:8453"]' '["openclaw"]'
assert_file_exists "${HOME}/.ows/agent-installer.json" "State file created"

set +e
read_state
rc=$?
set -e
assert_equals "0" "$rc" "read_state returns 0 for valid state"
teardown_sandbox

# Test: get_state_field
setup_sandbox
write_state "my-wallet" "0xABCD" "test-policy" "test-key" '["eip155:8453"]' '["openclaw"]'
val=$(get_state_field "wallet_name")
assert_equals "my-wallet" "$val" "get_state_field returns wallet_name"

val=$(get_state_field "agent_address")
assert_equals "0xABCD" "$val" "get_state_field returns agent_address"

val=$(get_state_field "allowed_chains")
assert_equals '["eip155:8453"]' "$val" "get_state_field returns allowed_chains as JSON"
teardown_sandbox

# Test: detect_installation with no state
setup_sandbox
result=$(detect_installation)
assert_equals "none" "$result" "detect_installation returns none when no state"
teardown_sandbox

# Test: detect_installation with complete state
setup_sandbox
setup_existing_install "agent-wallet"
result=$(detect_installation)
assert_equals "complete" "$result" "detect_installation returns complete"
teardown_sandbox

# Test: detect_installation with partial state (invalid JSON)
setup_sandbox
mkdir -p "${HOME}/.ows"
echo "not json" > "${HOME}/.ows/agent-installer.json"
result=$(detect_installation)
assert_equals "partial" "$result" "detect_installation returns partial for invalid JSON"
teardown_sandbox

# Test: clear_state
setup_sandbox
write_state "x" "0x0" "p" "k" "[]" "[]"
assert_file_exists "${HOME}/.ows/agent-installer.json" "State file exists before clear"
clear_state
assert_file_not_exists "${HOME}/.ows/agent-installer.json" "State file removed after clear"
teardown_sandbox

# Test: state file is valid JSON
setup_sandbox
write_state "w" "0x1" "p" "k" '["eip155:8453"]' '[]'
set +e
python3 -c "import json; json.load(open('${HOME}/.ows/agent-installer.json'))" 2>/dev/null
rc=$?
set -e
assert_equals "0" "$rc" "State file is valid JSON"
teardown_sandbox

test_summary
