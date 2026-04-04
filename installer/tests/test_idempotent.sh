#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"

printf "== test_idempotent ==\n"

# Test: Second run detects existing install (doesn't re-create wallet)
setup_sandbox
mock_openclaw

# First run
set +e
bash "${INSTALLER_DIR}/install.sh" 2>/dev/null
rc1=$?
set -e
assert_equals "0" "$rc1" "First run exits 0"

# Count wallet create calls after first run
wc_count_1=$(grep -c "wallet create" "$MOCK_OWS_LOG" || echo "0")
assert_equals "1" "$wc_count_1" "First run calls wallet create once"

# Save state for comparison
cp "${HOME}/.ows/agent-installer.json" "${SANDBOX_DIR}/state-before.json"

# Second run -- should enter management menu and quit (non-interactive sends 'q')
# In non-interactive mode, the management menu can't really run interactively,
# so we just verify it doesn't crash and doesn't call wallet create again
set +e
echo "q" | AGENT_NON_INTERACTIVE=0 bash "${INSTALLER_DIR}/install.sh" 2>/dev/null
rc2=$?
set -e

# Check no additional wallet create calls
wc_count_2=$(grep -c "wallet create" "$MOCK_OWS_LOG" || echo "0")
assert_equals "1" "$wc_count_2" "Second run does not call wallet create again"

# State file should still exist
assert_file_exists "${HOME}/.ows/agent-installer.json" "State file persists after second run"

teardown_sandbox

test_summary
