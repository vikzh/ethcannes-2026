#!/usr/bin/env bash
# helpers.sh -- Shared test utilities for the installer test suite

# Resolve paths
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER_DIR="$(cd "${TESTS_DIR}/.." && pwd)"
MOCKS_DIR="${TESTS_DIR}/mocks"

# Test counters
PASS_COUNT=0
FAIL_COUNT=0
TEST_NAME=""

# ---------------------------------------------------------------------------
# Sandbox management
# ---------------------------------------------------------------------------

SANDBOX_DIR=""
ORIGINAL_HOME="${HOME}"
ORIGINAL_PATH="${PATH}"

# setup_sandbox -- creates an isolated test environment
setup_sandbox() {
  SANDBOX_DIR="$(mktemp -d)"
  export HOME="${SANDBOX_DIR}"
  export MOCK_OWS_LOG="${SANDBOX_DIR}/ows-invocations.log"
  export AGENT_NON_INTERACTIVE=1
  export INSTALLER_LIB_DIR="${INSTALLER_DIR}/lib"
  # Prepend mocks to PATH so they shadow real binaries
  export PATH="${MOCKS_DIR}:${INSTALLER_DIR}:${ORIGINAL_PATH}"
  # Create .ows directory
  mkdir -p "${HOME}/.ows"
  # Reset mock state
  export MOCK_OWS_FAIL=""
  export MOCK_OWS_WALLETS=""
  export MOCK_OWS_KEYS=""
  export MOCK_UNAME_OUTPUT="Darwin"
  touch "$MOCK_OWS_LOG"
}

# teardown_sandbox -- cleans up the test environment
teardown_sandbox() {
  if [[ -n "${SANDBOX_DIR:-}" ]] && [[ -d "${SANDBOX_DIR}" ]]; then
    rm -rf "${SANDBOX_DIR}"
  fi
  export HOME="${ORIGINAL_HOME}"
  export PATH="${ORIGINAL_PATH}"
}

# Register cleanup trap
trap teardown_sandbox EXIT

# ---------------------------------------------------------------------------
# Agent mock helpers
# ---------------------------------------------------------------------------

mock_openclaw() {
  mkdir -p "${HOME}/.openclaw"
  local bin_dir="${SANDBOX_DIR}/mock-bins"
  mkdir -p "$bin_dir"
  # Mock openclaw: succeed for detection but fail for mcp subcommands
  # (mock can't actually write MCP config, so the JSON fallback should handle it)
  cat > "${bin_dir}/openclaw" <<'MOCK_OC'
#!/usr/bin/env bash
if [[ "${1:-}" == "mcp" ]]; then
  exit 1
fi
echo "openclaw mock"
MOCK_OC
  chmod +x "${bin_dir}/openclaw"
  export PATH="${bin_dir}:${PATH}"
}

mock_claude() {
  mkdir -p "${HOME}/.claude"
  local bin_dir="${SANDBOX_DIR}/mock-bins"
  mkdir -p "$bin_dir"
  # Mock claude: succeed for detection but fail for mcp subcommands
  cat > "${bin_dir}/claude" <<'MOCK_CL'
#!/usr/bin/env bash
if [[ "${1:-}" == "mcp" ]]; then
  exit 1
fi
echo "claude mock"
MOCK_CL
  chmod +x "${bin_dir}/claude"
  export PATH="${bin_dir}:${PATH}"
}

mock_codex() {
  mkdir -p "${HOME}/.codex"
  local bin_dir="${SANDBOX_DIR}/mock-bins"
  mkdir -p "$bin_dir"
  printf '#!/usr/bin/env bash\necho "codex mock"\n' > "${bin_dir}/codex"
  chmod +x "${bin_dir}/codex"
  export PATH="${bin_dir}:${PATH}"
}

mock_no_agents() {
  # Remove any agent dirs and binaries from sandbox
  rm -rf "${HOME}/.openclaw" "${HOME}/.claude" "${HOME}/.codex"
  rm -rf "${SANDBOX_DIR}/mock-bins"
  # Build a PATH that excludes real agent binaries by only keeping essential system dirs
  local clean_path=""
  IFS=':' read -ra path_parts <<< "$ORIGINAL_PATH"
  for p in "${path_parts[@]}"; do
    # Skip directories that contain agent binaries
    if [[ -x "${p}/openclaw" ]] || [[ -x "${p}/claude" ]] || [[ -x "${p}/codex" ]]; then
      continue
    fi
    if [[ -n "$clean_path" ]]; then
      clean_path="${clean_path}:${p}"
    else
      clean_path="${p}"
    fi
  done
  export PATH="${MOCKS_DIR}:${INSTALLER_DIR}:${clean_path}"
}

# ---------------------------------------------------------------------------
# Pre-populated installation state
# ---------------------------------------------------------------------------

setup_existing_install() {
  local wallet_name="${1:-agent-wallet}"
  local agent_address="0xA0E41234567890abcdef1234567890abcdef1234"
  mkdir -p "${HOME}/.ows"
  # State file
  cat > "${HOME}/.ows/agent-installer.json" <<EOF
{
  "version": "0.1.0",
  "wallet_name": "${wallet_name}",
  "agent_address": "${agent_address}",
  "policy_id": "agent-chain-only",
  "key_name": "agent-key",
  "allowed_chains": ["eip155:8453", "eip155:84532"],
  "installed_agents": ["openclaw"],
  "installed_at": "2026-04-03T10:00:00Z"
}
EOF
  # Key file
  printf 'ows_key_mock_0000000000000000000000000000000000000000000000000000000000000000' > "${HOME}/.ows/${wallet_name}.key"
  chmod 600 "${HOME}/.ows/${wallet_name}.key"
  # Mock wallet exists
  export MOCK_OWS_WALLETS="${wallet_name}"
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

assert_file_exists() {
  local path="$1" label="${2:-File exists: $1}"
  if [[ -f "$path" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (file not found: %s)\n" "$label" "$path"
  fi
}

assert_dir_exists() {
  local path="$1" label="${2:-Dir exists: $1}"
  if [[ -d "$path" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (dir not found: %s)\n" "$label" "$path"
  fi
}

assert_file_not_exists() {
  local path="$1" label="${2:-File not exists: $1}"
  if [[ ! -f "$path" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (file exists but shouldn't: %s)\n" "$label" "$path"
  fi
}

assert_file_contains() {
  local path="$1" pattern="$2" label="${3:-File contains: $2}"
  if grep -q "$pattern" "$path" 2>/dev/null; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (pattern '%s' not found in %s)\n" "$label" "$pattern" "$path"
  fi
}

assert_file_not_contains() {
  local path="$1" pattern="$2" label="${3:-File not contains: $2}"
  if ! grep -q "$pattern" "$path" 2>/dev/null; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (pattern '%s' found in %s but shouldn't be)\n" "$label" "$pattern" "$path"
  fi
}

assert_file_perms() {
  local path="$1" expected="$2" label="${3:-File perms: $1 == $2}"
  local actual
  actual=$(stat -f "%Lp" "$path" 2>/dev/null || stat -c "%a" "$path" 2>/dev/null)
  if [[ "$actual" == "$expected" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (got %s, expected %s)\n" "$label" "$actual" "$expected"
  fi
}

assert_exit_code() {
  local expected="$1"
  shift
  local actual
  set +e
  "$@" >/dev/null 2>&1
  actual=$?
  set -e
  local label="Exit code == ${expected}: $*"
  if [[ "$actual" == "$expected" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (got %s)\n" "$label" "$actual"
  fi
}

assert_line_in_log() {
  local line_num="$1" pattern="$2" label="${3:-Log line $1 matches: $2}"
  local actual
  actual=$(sed -n "${line_num}p" "$MOCK_OWS_LOG" 2>/dev/null)
  if echo "$actual" | grep -q "$pattern"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (line %s: '%s')\n" "$label" "$line_num" "$actual"
  fi
}

assert_log_count() {
  local expected="$1" label="${2:-Log has $1 entries}"
  local actual
  actual=$(wc -l < "$MOCK_OWS_LOG" | tr -d ' ')
  if [[ "$actual" == "$expected" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (got %s)\n" "$label" "$actual"
  fi
}

assert_json_field() {
  local file="$1" field="$2" expected="$3" label="${4:-JSON field $2 == $3}"
  local actual
  actual=$(python3 -c "
import json
with open('${file}') as f:
    data = json.load(f)
val = data.get('${field}')
if isinstance(val, (list, dict)):
    print(json.dumps(val))
else:
    print(val)
" 2>/dev/null)
  if [[ "$actual" == "$expected" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (got '%s')\n" "$label" "$actual"
  fi
}

assert_equals() {
  local expected="$1" actual="$2" label="${3:-equals check}"
  if [[ "$actual" == "$expected" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  PASS: %s\n" "$label"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  FAIL: %s (expected '%s', got '%s')\n" "$label" "$expected" "$actual"
  fi
}

# ---------------------------------------------------------------------------
# Test lifecycle
# ---------------------------------------------------------------------------

test_summary() {
  local total=$((PASS_COUNT + FAIL_COUNT))
  printf "\n%d/%d tests passed" "$PASS_COUNT" "$total"
  if [[ $FAIL_COUNT -gt 0 ]]; then
    printf ", %d failed" "$FAIL_COUNT"
  fi
  printf "\n"
  return $FAIL_COUNT
}
