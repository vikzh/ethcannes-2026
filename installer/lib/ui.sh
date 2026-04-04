#!/usr/bin/env bash
# ui.sh -- TUI helpers for the agent wallet installer
# Provides: spinners, in-place step updates, box-drawing, color palette

# ---------------------------------------------------------------------------
# Terminal detection
# ---------------------------------------------------------------------------
_IS_TTY=false
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  _IS_TTY=true
fi

# ---------------------------------------------------------------------------
# Color palette (disabled if NO_COLOR is set or stdout is not a terminal)
# ---------------------------------------------------------------------------
if [[ "$_IS_TTY" == "true" ]]; then
  _GREEN=$'\033[0;32m'
  _RED=$'\033[0;31m'
  _YELLOW=$'\033[0;33m'
  _BLUE=$'\033[0;34m'
  _CYAN=$'\033[0;36m'
  _DIM=$'\033[2m'
  _BOLD=$'\033[1m'
  _RESET=$'\033[0m'
else
  _GREEN=''
  _RED=''
  _YELLOW=''
  _BLUE=''
  _CYAN=''
  _DIM=''
  _BOLD=''
  _RESET=''
fi

# ---------------------------------------------------------------------------
# Symbols
# ---------------------------------------------------------------------------
_SYM_OK="${_GREEN}✓${_RESET}"
_SYM_FAIL="${_RED}✗${_RESET}"
_SYM_SKIP="${_YELLOW}⊘${_RESET}"

# Plain-text fallbacks when not a TTY
if [[ "$_IS_TTY" != "true" ]]; then
  _SYM_OK="OK"
  _SYM_FAIL="FAIL"
  _SYM_SKIP="SKIP"
fi

# ---------------------------------------------------------------------------
# Spinner
# ---------------------------------------------------------------------------
_SPINNER_PID=""
_SPINNER_FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

# _spinner_start label
# Starts an animated spinner on the current line. Writes to stderr.
_spinner_start() {
  local label="$1"
  if [[ "$_IS_TTY" != "true" ]]; then
    printf "%s...\n" "$label" >&2
    return
  fi
  # Run spinner in background subshell
  (
    local i=0
    while true; do
      printf "\r\033[2K  ${_BLUE}%s${_RESET} %s" "${_SPINNER_FRAMES[$((i % 10))]}" "$label" >&2
      i=$((i + 1))
      sleep 0.08
    done
  ) &
  _SPINNER_PID=$!
  # Ensure spinner is cleaned up on exit
  trap '_spinner_stop 2>/dev/null' EXIT
}

# _spinner_stop
# Kills the spinner and clears the line.
_spinner_stop() {
  if [[ -n "$_SPINNER_PID" ]]; then
    kill "$_SPINNER_PID" 2>/dev/null
    wait "$_SPINNER_PID" 2>/dev/null || true
    _SPINNER_PID=""
    if [[ "$_IS_TTY" == "true" ]]; then
      printf "\r\033[2K" >&2
    fi
  fi
}

# ---------------------------------------------------------------------------
# Step functions
# ---------------------------------------------------------------------------
# Global step total (set by caller before using step functions)
TOTAL_STEPS="${TOTAL_STEPS:-8}"

# Per-step timer
_STEP_START_TIME=""

# step_start N label
# Shows spinner with step label. Starts per-step timer.
step_start() {
  local n="$1" label="$2"
  _STEP_START_TIME=$(date +%s)
  _spinner_start "${_BOLD}[${n}/${TOTAL_STEPS}]${_RESET} ${label}"
}

# _format_elapsed start_time
# Prints formatted elapsed time string.
_format_elapsed() {
  local start="$1"
  local now
  now=$(date +%s)
  local elapsed=$((now - start))
  if [[ $elapsed -lt 1 ]]; then
    printf "${_DIM}(<1s)${_RESET}"
  else
    printf "${_DIM}(%ds)${_RESET}" "$elapsed"
  fi
}

# step_done N label [detail]
# Stops spinner, prints success line with checkmark and elapsed time.
step_done() {
  local n="$1" label="$2" detail="${3:-}"
  _spinner_stop
  local time_str=""
  if [[ -n "$_STEP_START_TIME" ]]; then
    time_str=" $(_format_elapsed "$_STEP_START_TIME")"
    _STEP_START_TIME=""
  fi
  local detail_str=""
  if [[ -n "$detail" ]]; then
    detail_str="  ${_DIM}${detail}${_RESET}"
  fi
  if [[ "$_IS_TTY" == "true" ]]; then
    printf "\r\033[2K  %s ${_BOLD}[%d/%d]${_RESET} %s%s%s\n" "$_SYM_OK" "$n" "$TOTAL_STEPS" "$label" "$detail_str" "$time_str" >&2
  else
    printf "  %s [%d/%d] %s%s%s\n" "$_SYM_OK" "$n" "$TOTAL_STEPS" "$label" "${detail:+  $detail}" "$time_str" >&2
  fi
}

# step_fail N label [error_msg]
# Stops spinner, prints failure line with cross.
step_fail() {
  local n="$1" label="$2" error_msg="${3:-}"
  _spinner_stop
  local time_str=""
  if [[ -n "$_STEP_START_TIME" ]]; then
    time_str=" $(_format_elapsed "$_STEP_START_TIME")"
    _STEP_START_TIME=""
  fi
  if [[ "$_IS_TTY" == "true" ]]; then
    printf "\r\033[2K  %s ${_BOLD}[%d/%d]${_RESET} %s%s\n" "$_SYM_FAIL" "$n" "$TOTAL_STEPS" "$label" "$time_str" >&2
  else
    printf "  %s [%d/%d] %s%s\n" "$_SYM_FAIL" "$n" "$TOTAL_STEPS" "$label" "$time_str" >&2
  fi
  if [[ -n "$error_msg" ]]; then
    printf "    ${_DIM}%s${_RESET}\n" "$error_msg" >&2
  fi
}

# step_skip N label [reason]
# Prints skip line (no spinner needed).
step_skip() {
  local n="$1" label="$2" reason="${3:-}"
  _spinner_stop
  _STEP_START_TIME=""
  local reason_str=""
  if [[ -n "$reason" ]]; then
    reason_str="  ${_DIM}${reason}${_RESET}"
  fi
  if [[ "$_IS_TTY" == "true" ]]; then
    printf "\r\033[2K  %s ${_BOLD}[%d/%d]${_RESET} %s%s\n" "$_SYM_SKIP" "$n" "$TOTAL_STEPS" "$label" "$reason_str" >&2
  else
    printf "  %s [%d/%d] %s%s\n" "$_SYM_SKIP" "$n" "$TOTAL_STEPS" "$label" "${reason:+  $reason}" >&2
  fi
}

# ---------------------------------------------------------------------------
# run_with_spinner label command [args...]
# Runs a command with spinner. On success: discards output. On failure: shows output dimmed.
# Returns the command's exit code.
# ---------------------------------------------------------------------------
run_with_spinner() {
  local label="$1"; shift
  local output_file
  output_file=$(mktemp)
  _spinner_start "$label"
  local rc=0
  "$@" > "$output_file" 2>&1 || rc=$?
  _spinner_stop
  if [[ $rc -ne 0 ]]; then
    # Show captured output on failure
    if [[ -s "$output_file" ]]; then
      while IFS= read -r line; do
        printf "    ${_DIM}%s${_RESET}\n" "$line" >&2
      done < "$output_file"
    fi
  fi
  rm -f "$output_file"
  return $rc
}

# ---------------------------------------------------------------------------
# Header and summary
# ---------------------------------------------------------------------------

# print_header
# Displays branded installer header.
print_header() {
  local title="Agent Wallet Installer"
  local platform
  platform="$(uname -s) · $(uname -m)"
  printf "\n" >&2
  printf "  ${_BOLD}%s${_RESET}\n" "$title" >&2
  printf "  ${_DIM}%s${_RESET}\n" "$platform" >&2
  printf "\n" >&2
}

# print_summary_box address wallet_name agents_display [total_elapsed]
# Displays completion summary.
print_summary_box() {
  local address="$1" wallet_name="$2" agents_display="$3" total_elapsed="${4:-}"
  printf "\n" >&2
  printf "  ${_GREEN}${_BOLD}Installation complete!${_RESET}\n" >&2
  printf "\n" >&2
  printf "  Address:  ${_CYAN}%s${_RESET}\n" "$address" >&2
  printf "  Wallet:   %s\n" "$wallet_name" >&2
  if [[ -n "$agents_display" ]]; then
    printf "  Agents:   %s\n" "$agents_display" >&2
  fi
  printf "\n" >&2
  if [[ -n "$total_elapsed" ]]; then
    printf "  ${_DIM}Done in %ss${_RESET}\n" "$total_elapsed" >&2
  fi
  printf "  ${_DIM}Save this address for AA contract setup.${_RESET}\n" >&2
  printf "\n" >&2
}

# ---------------------------------------------------------------------------
# print_menu wallet_name agent_address
# Displays the management menu header and options.
# ---------------------------------------------------------------------------
print_menu() {
  local wallet_name="$1" agent_address="$2"
  printf "\n" >&2
  printf "  ${_BOLD}Agent Wallet Manager${_RESET}\n" >&2
  printf "  ${_DIM}Wallet:${_RESET} %s ${_DIM}(%s)${_RESET}\n\n" "$wallet_name" "$agent_address" >&2
  printf "  [1] View status\n" >&2
  printf "  [2] Update chain policy\n" >&2
  printf "  [3] Regenerate API key\n" >&2
  printf "  [4] Reinstall MCP\n" >&2
  printf "  [5] Reinstall everything (fresh)\n" >&2
  printf "  [6] Uninstall\n" >&2
  printf "  [q] Quit\n" >&2
  printf "\n" >&2
}

# ---------------------------------------------------------------------------
# Legacy print_step -- kept for backward compat in tests/self-test
# Maps to new step functions when called with status.
# ---------------------------------------------------------------------------
print_step() {
  local n="$1" m="$2" label="$3" status="${4:-}"
  TOTAL_STEPS="$m"
  case "$status" in
    ok)   step_done "$n" "$label" ;;
    fail) step_fail "$n" "$label" ;;
    skip) step_skip "$n" "$label" ;;
    *)    step_start "$n" "$label" ;;
  esac
}

# ---------------------------------------------------------------------------
# Message helpers
# ---------------------------------------------------------------------------
print_success() {
  printf "  %s %s\n" "$_SYM_OK" "$1" >&2
}

print_error() {
  printf "  %s ${_RED}%s${_RESET}\n" "$_SYM_FAIL" "$1" >&2
}

print_warning() {
  printf "  %s ${_YELLOW}%s${_RESET}\n" "$_SYM_SKIP" "$1" >&2
}

print_info() {
  printf "  ${_BLUE}%s${_RESET}\n" "$1" >&2
}

# ---------------------------------------------------------------------------
# Prompt functions (unchanged API)
# ---------------------------------------------------------------------------

# prompt label default
prompt() {
  local label="$1" default="$2"
  if [[ "${AGENT_NON_INTERACTIVE:-0}" == "1" ]]; then
    echo "$default"
    return 0
  fi
  local input
  printf "%s [%s]: " "$label" "$default" >&2
  read -r input
  echo "${input:-$default}"
}

# prompt_confirm message [default_yes]
prompt_confirm() {
  local message="$1" default_yes="${2:-y}"
  if [[ "${AGENT_NON_INTERACTIVE:-0}" == "1" ]]; then
    return 0
  fi
  local hint
  if [[ "$default_yes" == "y" ]]; then
    hint="Y/n"
  else
    hint="y/N"
  fi
  local input
  printf "%s [%s]: " "$message" "$hint" >&2
  read -r input
  input="${input:-$default_yes}"
  case "$input" in
    [Yy]*) return 0 ;;
    *)     return 1 ;;
  esac
}

# prompt_select [--labels label1 label2 ...] -- item1 item2 ...
prompt_select() {
  local labels=()
  local items=()

  if [[ "${1:-}" == "--labels" ]]; then
    shift
    while [[ $# -gt 0 ]] && [[ "$1" != "--" ]]; do
      labels+=("$1")
      shift
    done
    [[ "${1:-}" == "--" ]] && shift
  fi
  items=("$@")

  if [[ ${#labels[@]} -eq 0 ]]; then
    labels=("${items[@]}")
  fi

  if [[ "${AGENT_NON_INTERACTIVE:-0}" == "1" ]]; then
    echo "${items[*]}"
    return 0
  fi
  local i
  for i in "${!items[@]}"; do
    printf "  [%d] %s\n" "$((i + 1))" "${labels[$i]}" >&2
  done
  printf "  [A] All\n" >&2
  printf "  [N] None\n" >&2
  printf "Select: " >&2
  local input
  read -r input
  case "$input" in
    [Aa]) echo "${items[*]}" ;;
    [Nn]) echo "" ;;
    *)
      local selected=()
      IFS=',' read -ra nums <<< "$input"
      for num in "${nums[@]}"; do
        num=$(echo "$num" | tr -d ' ')
        if [[ "$num" =~ ^[0-9]+$ ]] && (( num >= 1 && num <= ${#items[@]} )); then
          selected+=("${items[$((num - 1))]}")
        fi
      done
      echo "${selected[*]}"
      ;;
  esac
}

# prompt_menu
prompt_menu() {
  local input
  printf "Select: " >&2
  read -r input
  echo "$input"
}
