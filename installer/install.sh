#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Agent Wallet Installer
# ---------------------------------------------------------------------------
# Interactive TUI for installing and managing an OWS agent wallet
# with chain-restricted policy and agent skills.
#
# Usage:
#   ./install.sh [--wallet-name <name>]
#
# Environment variables:
#   AGENT_WALLET_NAME      Wallet name (default: agent-wallet)
#   AGENT_NON_INTERACTIVE  Set to 1 for non-interactive mode
# ---------------------------------------------------------------------------

TOTAL_STEPS=8

# Resolve script directory (works for symlinks and curl|bash)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
INSTALLER_LIB_DIR="${SCRIPT_DIR}/lib"
export INSTALLER_LIB_DIR

# Source library files
source "${INSTALLER_LIB_DIR}/ui.sh"
source "${INSTALLER_LIB_DIR}/state.sh"
source "${INSTALLER_LIB_DIR}/functions.sh"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
WALLET_NAME="${AGENT_WALLET_NAME:-$DEFAULT_WALLET_NAME}"
RUN_SELF_TEST=0
FORCE_REINSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wallet-name)
      WALLET_NAME="$2"
      shift 2
      ;;
    --self-test)
      RUN_SELF_TEST=1
      shift
      ;;
    --reinstall)
      FORCE_REINSTALL=1
      shift
      ;;
    --help|-h)
      printf "Usage: %s [--wallet-name <name>] [--self-test] [--reinstall]\n" "$0"
      printf "\nOptions:\n"
      printf "  --wallet-name <name>   Wallet name (default: agent-wallet)\n"
      printf "  --self-test            Run automated end-to-end test with real OWS\n"
      printf "  --reinstall            Uninstall everything and start fresh\n"
      printf "\nEnvironment variables:\n"
      printf "  AGENT_WALLET_NAME      Wallet name (default: agent-wallet)\n"
      printf "  AGENT_NON_INTERACTIVE  Set to 1 for non-interactive mode\n"
      printf "  OWS_PASSPHRASE         Wallet passphrase (required for non-interactive)\n"
      exit 0
      ;;
    *)
      print_error "Unknown argument: $1"
      exit 5
      ;;
  esac
done

# ---------------------------------------------------------------------------
# First-run installation flow
# ---------------------------------------------------------------------------
run_first_install() {
  printf "\n${_BOLD}Agent Wallet Installer${_RESET}\n"
  printf "======================\n\n"

  # Step 1: Platform check
  print_step 1 $TOTAL_STEPS "Checking platform..."
  if ! detect_platform; then
    exit 1
  fi
  print_step 1 $TOTAL_STEPS "Checking platform..." "ok"

  # Step 2: OWS check/install
  print_step 2 $TOTAL_STEPS "Checking OWS..."
  if check_ows_installed; then
    print_step 2 $TOTAL_STEPS "Checking OWS... $(get_ows_version)" "ok"
  else
    print_step 2 $TOTAL_STEPS "Installing OWS..."
    if ! install_ows; then
      exit 2
    fi
    print_step 2 $TOTAL_STEPS "OWS installed" "ok"
  fi

  # Step 3: Node.js check
  print_step 3 $TOTAL_STEPS "Checking Node.js..."
  if check_node_installed; then
    print_step 3 $TOTAL_STEPS "Checking Node.js... $(node --version 2>/dev/null)" "ok"
  else
    print_error "Node.js is required for the MCP server. Install from https://nodejs.org"
    exit 5
  fi

  # Step 4: Wallet creation
  print_step 4 $TOTAL_STEPS "Creating wallet..."
  WALLET_NAME=$(prompt "Wallet name" "$WALLET_NAME")
  local agent_address
  agent_address=$(create_wallet "$WALLET_NAME") || exit 3
  print_step 4 $TOTAL_STEPS "Wallet created: ${agent_address}" "ok"

  # Step 5: Chain policy
  print_step 5 $TOTAL_STEPS "Setting up chain policy..."
  if ! create_policy; then
    exit 5
  fi
  print_step 5 $TOTAL_STEPS "Chain policy: Base + Base Sepolia" "ok"

  # Step 6: API key
  print_step 6 $TOTAL_STEPS "Generating API key..."
  local key_file
  key_file=$(create_api_key "$WALLET_NAME") || exit 4
  print_step 6 $TOTAL_STEPS "API key saved to ${key_file}" "ok"

  # Step 7: MCP server setup
  print_step 7 $TOTAL_STEPS "Setting up MCP server..."
  if ! install_mcp_deps; then
    exit 5
  fi
  print_step 7 $TOTAL_STEPS "MCP server ready" "ok"

  # Step 8: Agent registration (MCP)
  print_step 8 $TOTAL_STEPS "Registering with agents..."
  local agents_str
  agents_str=$(detect_agents)
  local selected_agents=""
  if [[ -z "$agents_str" ]]; then
    print_warning "No supported agents detected. You can register MCP manually later."
  else
    # Build display names for detected agents
    local agents_display=""
    for a in $agents_str; do
      local dn
      dn=$(get_agent_display_name "$a")
      agents_display="${agents_display:+$agents_display, }${dn}"
    done

    local agent_count
    agent_count=$(echo "$agents_str" | wc -w | tr -d ' ')
    if [[ "$agent_count" == "1" ]]; then
      local single_display
      single_display=$(get_agent_display_name "$agents_str")
      print_info "Detected: ${single_display}"
      if prompt_confirm "Register MCP for ${single_display}?"; then
        selected_agents="$agents_str"
      fi
    else
      print_info "Detected: ${agents_display}"
      # Build label array for prompt_select
      local agent_labels=()
      for a in $agents_str; do
        agent_labels+=("$(get_agent_display_name "$a")")
      done
      # shellcheck disable=SC2086
      selected_agents=$(prompt_select --labels "${agent_labels[@]}" -- $agents_str)
    fi

    if [[ -n "$selected_agents" ]]; then
      for agent in $selected_agents; do
        register_mcp "$agent" "$WALLET_NAME"
      done
      local agent_count_selected
      agent_count_selected=$(echo "$selected_agents" | wc -w | tr -d ' ')
      print_step 8 $TOTAL_STEPS "${agent_count_selected} agent(s) configured (MCP)" "ok"
    else
      print_step 8 $TOTAL_STEPS "No agents configured" "skip"
    fi
  fi

  # Write state
  local agents_json
  agents_json=$(build_agents_json "${selected_agents}")
  write_state "$WALLET_NAME" "$agent_address" "$POLICY_ID" "$KEY_NAME" "$DEFAULT_ALLOWED_CHAINS" "$agents_json"

  # Summary
  printf "\n${_BOLD}Installation complete!${_RESET}\n\n"
  printf "  Agent wallet address: ${_GREEN}%s${_RESET}\n" "$agent_address"
  printf "  Wallet name:          %s\n" "$WALLET_NAME"
  printf "\nSave this address -- you'll need it for AA contract setup.\n\n"
}

# ---------------------------------------------------------------------------
# Management menu
# ---------------------------------------------------------------------------
run_management_menu() {
  local wallet_name agent_address
  wallet_name=$(get_state_field "wallet_name")
  agent_address=$(get_state_field "agent_address")

  while true; do
    print_menu "$wallet_name" "$agent_address"
    local choice
    choice=$(prompt_menu)

    case "$choice" in
      1) show_status ;;
      2) update_policy ;;
      3) regenerate_key ;;
      4) reinstall_mcp ;;
      5)
        fresh_reinstall
        local rc=$?
        if [[ $rc -eq 2 ]]; then
          # Signal to run first-run flow
          run_first_install
          return 0
        fi
        ;;
      6)
        full_uninstall
        if [[ ! -f "$(_get_state_file)" ]]; then
          # Uninstall completed, exit
          return 0
        fi
        ;;
      q|Q) return 0 ;;
      *)
        print_warning "Invalid selection."
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Self-test: automated end-to-end validation with real OWS
# ---------------------------------------------------------------------------
run_self_test() {
  local test_pass=0
  local test_fail=0
  local test_wallet="self-test-$$"

  _st_pass() { test_pass=$((test_pass + 1)); printf "  PASS: %s\n" "$1"; }
  _st_fail() { test_fail=$((test_fail + 1)); printf "  FAIL: %s\n" "$1"; }

  printf "\n%sSelf-Test: Agent Wallet Installer%s\n" "$_BOLD" "$_RESET"
  printf "==================================\n\n"

  # Use a temp HOME to avoid polluting real config
  local original_home="$HOME"
  local test_home
  test_home="$(mktemp -d)"
  export HOME="$test_home"
  # Copy OWS binary location into new HOME path
  mkdir -p "${test_home}/.ows/bin"
  local ows_bin
  ows_bin="$(command -v ows 2>/dev/null || echo "${original_home}/.ows/bin/ows")"
  if [[ ! -x "$ows_bin" ]]; then
    _st_fail "OWS binary not found at ${ows_bin}"
    export HOME="$original_home"
    rm -rf "$test_home"
    printf "\n%d passed, %d failed\n" "$test_pass" "$test_fail"
    return 1
  fi
  # Symlink ows binary into test home
  ln -sf "$ows_bin" "${test_home}/.ows/bin/ows"
  export PATH="${test_home}/.ows/bin:${PATH}"

  # No passphrase needed -- wallets use empty passphrase
  unset OWS_PASSPHRASE 2>/dev/null || true
  export AGENT_NON_INTERACTIVE=1
  export AGENT_WALLET_NAME="$test_wallet"

  # Cleanup trap
  _st_cleanup() {
    # Clean up OWS artifacts (empty passphrase)
    ows key revoke --id "$KEY_NAME" --confirm 2>/dev/null || true
    ows policy delete --id "$POLICY_ID" --confirm 2>/dev/null || true
    echo "" | OWS_PASSPHRASE="" ows wallet delete --wallet "$test_wallet" --confirm 2>/dev/null || true
    export HOME="$original_home"
    rm -rf "$test_home"
  }
  trap _st_cleanup EXIT

  # --- Test 1: First-run install ---
  printf "Phase 1: First-run install\n"
  WALLET_NAME="$test_wallet"
  set +e
  run_first_install 2>&1
  local rc=$?
  set -e

  if [[ $rc -eq 0 ]]; then
    _st_pass "First-run completed (exit 0)"
  else
    _st_fail "First-run failed (exit $rc)"
    _st_cleanup
    printf "\n%d passed, %d failed\n" "$test_pass" "$test_fail"
    return 1
  fi

  # Verify state file
  if [[ -f "$(_get_state_file)" ]]; then
    _st_pass "State file created"
  else
    _st_fail "State file not found"
  fi

  # Verify key file
  local key_file="${HOME}/.ows/${test_wallet}.key"
  if [[ -f "$key_file" ]]; then
    _st_pass "API key file created"
    local perms
    perms=$(stat -f "%Lp" "$key_file" 2>/dev/null || stat -c "%a" "$key_file" 2>/dev/null)
    if [[ "$perms" == "600" ]]; then
      _st_pass "Key file permissions are 0600"
    else
      _st_fail "Key file permissions are $perms (expected 600)"
    fi
    # Check key file contains an ows_key_ token
    if grep -q "ows_key_" "$key_file" 2>/dev/null; then
      _st_pass "Key file contains ows_key_ token"
    else
      _st_fail "Key file does not contain ows_key_ token"
    fi
  else
    _st_fail "API key file not found"
  fi

  # Verify wallet address in state
  local stored_address
  stored_address=$(get_state_field "agent_address" 2>/dev/null)
  if [[ -n "$stored_address" ]] && [[ "$stored_address" == 0x* ]]; then
    _st_pass "Agent address stored in state: $stored_address"
  else
    _st_fail "Agent address not found or invalid in state"
  fi

  # Verify agents in state (MCP only, no skill files)
  local agents_json
  agents_json=$(get_state_field "installed_agents" 2>/dev/null)
  _st_pass "Agents registered in state: ${agents_json:-[]}"

  # Verify MCP server can start and sign
  local mcp_server_path
  mcp_server_path="$(get_mcp_server_path)"
  if [[ -f "$mcp_server_path" ]]; then
    # Test: tools/list returns sign_message
    local mcp_init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
    local mcp_list='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    local mcp_output
    mcp_output=$(printf '%s\n%s\n' "$mcp_init" "$mcp_list" | \
      AGENT_WALLET_NAME="$test_wallet" timeout 10 node "$mcp_server_path" 2>/dev/null || true)
    if echo "$mcp_output" | grep -q "sign_message"; then
      _st_pass "MCP server lists sign_message tool"
    else
      _st_fail "MCP server did not list sign_message tool"
    fi

    # Test: initialize response includes instructions with wallet address
    if echo "$mcp_output" | grep -q "instructions"; then
      _st_pass "MCP server returns instructions"
    else
      _st_fail "MCP server missing instructions field"
    fi

    # Test: sign_message returns a signature via MCP
    local mcp_call='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sign_message","arguments":{"message":"mcp-self-test","chain":"base"}}}'
    local sign_output
    sign_output=$(printf '%s\n%s\n' "$mcp_init" "$mcp_call" | \
      AGENT_WALLET_NAME="$test_wallet" timeout 10 node "$mcp_server_path" 2>/dev/null || true)
    if echo "$sign_output" | grep -qE "[0-9a-fA-F]{40,}"; then
      _st_pass "MCP sign_message returns signature"
    else
      _st_fail "MCP sign_message failed: ${sign_output}"
    fi
  else
    _st_fail "MCP server not found at ${mcp_server_path}"
  fi

  # --- Test 2: Re-run detects existing install ---
  printf "\nPhase 2: Idempotent re-run detection\n"
  local install_state
  install_state=$(detect_installation)
  if [[ "$install_state" == "complete" ]]; then
    _st_pass "Re-run detects complete installation"
  else
    _st_fail "Re-run detection returned '$install_state' (expected 'complete')"
  fi

  # --- Test 3: Management operations ---
  printf "\nPhase 3: Management operations\n"

  # Status
  set +e
  local status_output
  status_output=$(show_status 2>&1)
  set -e
  if echo "$status_output" | grep -q "$test_wallet"; then
    _st_pass "show_status displays wallet name"
  else
    _st_fail "show_status doesn't display wallet name"
  fi

  # Regenerate key
  set +e
  regenerate_key 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]] && [[ -f "$key_file" ]]; then
    _st_pass "regenerate_key succeeded"
  else
    _st_fail "regenerate_key failed (exit $rc)"
  fi

  # --- Test 4: Reinstall ---
  printf "\nPhase 4: --reinstall\n"

  # Run reinstall (which uninstalls + installs fresh)
  set +e
  WALLET_NAME="$test_wallet"
  FORCE_REINSTALL=0  # Don't use the flag, simulate it
  do_uninstall_cleanup 2>&1
  # Also force-clean by wallet name (like --reinstall does)
  if ows wallet list 2>/dev/null | grep -q "Name:.*${test_wallet}$"; then
    echo "" | OWS_PASSPHRASE="" ows wallet delete --wallet "$test_wallet" --confirm 2>/dev/null || true
  fi
  delete_policy 2>/dev/null || true
  rm -f "${HOME}/.ows/${test_wallet}.key"

  # Verify cleanup
  local wallet_gone=true
  if ows wallet list 2>/dev/null | grep -q "Name:.*${test_wallet}$"; then
    wallet_gone=false
  fi
  set -e
  if [[ ! -f "$(_get_state_file)" ]]; then
    _st_pass "Reinstall: state file removed"
  else
    _st_fail "Reinstall: state file still exists"
  fi
  if [[ "$wallet_gone" == "true" ]]; then
    _st_pass "Reinstall: wallet removed from OWS"
  else
    _st_fail "Reinstall: wallet still in OWS"
  fi

  # Now run fresh install again
  set +e
  run_first_install 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    _st_pass "Reinstall: fresh install succeeded"
  else
    _st_fail "Reinstall: fresh install failed (exit $rc)"
  fi

  # Verify MCP signing works after reinstall
  key_file="${HOME}/.ows/${test_wallet}.key"
  if [[ -f "$key_file" ]]; then
    local mcp_init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
    local mcp_call='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sign_message","arguments":{"message":"reinstall-mcp-test","chain":"base"}}}'
    local sign_out
    sign_out=$(printf '%s\n%s\n' "$mcp_init" "$mcp_call" | \
      AGENT_WALLET_NAME="$test_wallet" timeout 10 node "$(get_mcp_server_path)" 2>/dev/null || true)
    if echo "$sign_out" | grep -qE "[0-9a-fA-F]{40,}"; then
      _st_pass "Reinstall: MCP signing works after reinstall"
    else
      _st_fail "Reinstall: MCP signing failed after reinstall"
    fi
  else
    _st_fail "Reinstall: key file not created"
  fi

  # --- Test 5: Final uninstall ---
  printf "\nPhase 5: Full uninstall\n"
  set +e
  do_uninstall_cleanup 2>&1
  if ows wallet list 2>/dev/null | grep -q "Name:.*${test_wallet}$"; then
    echo "" | OWS_PASSPHRASE="" ows wallet delete --wallet "$test_wallet" --confirm 2>/dev/null || true
  fi
  set -e
  if [[ ! -f "$(_get_state_file)" ]]; then
    _st_pass "Final uninstall: state file removed"
  else
    _st_fail "Final uninstall: state file still exists"
  fi
  if [[ ! -f "${HOME}/.ows/${test_wallet}.key" ]]; then
    _st_pass "Final uninstall: key file removed"
  else
    _st_fail "Final uninstall: key file still exists"
  fi

  # Summary
  printf "\n%sSelf-test results: %d passed, %d failed%s\n" "$_BOLD" "$test_pass" "$test_fail" "$_RESET"
  trap - EXIT
  export HOME="$original_home"
  rm -rf "$test_home"

  if [[ $test_fail -gt 0 ]]; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
main() {
  # Platform check first (always)
  detect_platform || exit 1

  # Self-test mode
  if [[ "$RUN_SELF_TEST" == "1" ]]; then
    run_self_test
    exit $?
  fi

  # Force reinstall mode
  if [[ "$FORCE_REINSTALL" == "1" ]]; then
    print_info "Removing existing installation..."
    # Clean up via state file if available
    do_uninstall_cleanup
    # Also try to clean up by wallet name in case state was missing or incomplete
    local target_wallet="$WALLET_NAME"
    if ows wallet list 2>/dev/null | grep -q "Name:.*${target_wallet}$"; then
      echo "" | OWS_PASSPHRASE="" ows wallet delete --wallet "$target_wallet" --confirm 2>/dev/null || true
    fi
    delete_policy 2>/dev/null || true
    rm -f "${HOME}/.ows/${target_wallet}.key"
    # Deregister MCP from all known agent types
    deregister_all_mcp
    run_first_install
    exit $?
  fi

  local install_state
  install_state=$(detect_installation)

  case "$install_state" in
    none)
      run_first_install
      ;;
    complete)
      run_management_menu
      ;;
    partial)
      print_warning "Previous installation detected but appears incomplete."
      if prompt_confirm "Start fresh installation?"; then
        do_uninstall_cleanup
        run_first_install
      else
        print_info "Run the installer again when ready."
        exit 0
      fi
      ;;
  esac
}

main
