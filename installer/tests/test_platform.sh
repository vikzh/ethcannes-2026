#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/helpers.sh"
source "${INSTALLER_DIR}/lib/ui.sh"
source "${INSTALLER_DIR}/lib/state.sh"
source "${INSTALLER_DIR}/lib/functions.sh"

printf "== test_platform ==\n"

# Test: detect_platform on Darwin
setup_sandbox
export MOCK_UNAME_OUTPUT="Darwin"
set +e
detect_platform 2>/dev/null
rc=$?
set -e
assert_equals "0" "$rc" "detect_platform returns 0 on Darwin"
teardown_sandbox

# Test: detect_platform on Linux
setup_sandbox
export MOCK_UNAME_OUTPUT="Linux"
set +e
detect_platform 2>/dev/null
rc=$?
set -e
assert_equals "1" "$rc" "detect_platform returns 1 on Linux"
teardown_sandbox

test_summary
