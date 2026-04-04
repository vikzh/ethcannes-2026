#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"
source "${INSTALLER_DIR}/lib/ui.sh"
source "${INSTALLER_DIR}/lib/state.sh"
source "${INSTALLER_DIR}/lib/functions.sh"

printf "== test_ows ==\n"

# Test: check_ows_installed with mock in PATH
setup_sandbox
set +e
check_ows_installed
rc=$?
set -e
assert_equals "0" "$rc" "check_ows_installed finds mock ows"
teardown_sandbox

# Test: create_wallet extracts EVM address
setup_sandbox
addr=$(create_wallet "test-wallet" 2>/dev/null)
assert_equals "0xA0E41234567890abcdef1234567890abcdef1234" "$addr" "create_wallet extracts correct EVM address"
assert_file_contains "$MOCK_OWS_LOG" "wallet create --name test-wallet" "create_wallet calls ows wallet create"
teardown_sandbox

# Test: create_policy calls ows policy create
setup_sandbox
# Make policy show fail so it doesn't think policy exists
export MOCK_OWS_FAIL="policy show"
set +e
create_policy 2>/dev/null
rc=$?
set -e
# policy show fails (expected), but create should still be called
# Reset and check without the fail
teardown_sandbox

setup_sandbox
create_policy 2>/dev/null
assert_line_in_log 1 "policy" "create_policy interacts with ows policy"
teardown_sandbox

# Test: create_api_key captures token and sets file perms
setup_sandbox
key_file=$(create_api_key "test-wallet" 2>/dev/null)
assert_file_exists "$key_file" "API key file created"
assert_file_contains "$key_file" "ows_key_mock" "Key file contains mock token"
assert_file_perms "$key_file" "600" "Key file has 0600 permissions"
teardown_sandbox

# Test: create_wallet with MOCK_OWS_FAIL
setup_sandbox
export MOCK_OWS_FAIL="wallet create"
set +e
create_wallet "fail-wallet" 2>/dev/null
rc=$?
set -e
assert_equals "3" "$rc" "create_wallet returns 3 on failure"
teardown_sandbox

test_summary
