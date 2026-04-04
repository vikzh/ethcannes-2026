#!/usr/bin/env bash
# ui.sh -- TUI helpers for the agent wallet installer

# Colors (disabled if NO_COLOR is set or stdout is not a terminal)
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  _GREEN=$'\033[0;32m'
  _RED=$'\033[0;31m'
  _YELLOW=$'\033[0;33m'
  _BLUE=$'\033[0;34m'
  _BOLD=$'\033[1m'
  _RESET=$'\033[0m'
else
  _GREEN=''
  _RED=''
  _YELLOW=''
  _BLUE=''
  _BOLD=''
  _RESET=''
fi

# print_step N M label [status]
# Prints: [N/M] label...   checkmark/X/empty
print_step() {
  local n="$1" m="$2" label="$3" status="${4:-}"
  local symbol=""
  case "$status" in
    ok)   symbol="${_GREEN}done${_RESET}" ;;
    fail) symbol="${_RED}FAILED${_RESET}" ;;
    skip) symbol="${_YELLOW}skipped${_RESET}" ;;
    *)    symbol="" ;;
  esac
  printf "${_BOLD}[%d/%d]${_RESET} %s %s\n" "$n" "$m" "$label" "$symbol"
}

# print_success message
print_success() {
  printf "${_GREEN}%s${_RESET}\n" "$1"
}

# print_error message
print_error() {
  printf "${_RED}Error: %s${_RESET}\n" "$1" >&2
}

# print_warning message
print_warning() {
  printf "${_YELLOW}Warning: %s${_RESET}\n" "$1"
}

# print_info message
print_info() {
  printf "${_BLUE}%s${_RESET}\n" "$1"
}

# print_menu wallet_name agent_address
# Displays the management menu header and options
print_menu() {
  local wallet_name="$1" agent_address="$2"
  printf "\n${_BOLD}Agent Wallet Manager${_RESET}\n"
  printf "====================\n"
  printf "Wallet: %s (%s)\n\n" "$wallet_name" "$agent_address"
  printf "  [1] View status\n"
  printf "  [2] Update chain policy\n"
  printf "  [3] Regenerate API key\n"
  printf "  [4] Reinstall MCP\n"
  printf "  [5] Reinstall everything (fresh)\n"
  printf "  [6] Uninstall\n"
  printf "  [q] Quit\n"
  printf "\n"
}

# prompt label default
# Reads user input with a default value. Returns input or default.
# In non-interactive mode (AGENT_NON_INTERACTIVE=1), returns default immediately.
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
# Y/n prompt. Returns 0 for yes, 1 for no.
# default_yes: if "y" (default), Enter means yes; if "n", Enter means no.
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
# Displays numbered list and "All" option. Returns space-separated selected items (internal IDs).
# If --labels is provided, those are used for display; otherwise items are displayed as-is.
# In non-interactive mode, selects all.
prompt_select() {
  local labels=()
  local items=()
  local parsing_labels=false

  # Parse args: --labels l1 l2 ... -- item1 item2 ...
  if [[ "${1:-}" == "--labels" ]]; then
    shift
    while [[ $# -gt 0 ]] && [[ "$1" != "--" ]]; do
      labels+=("$1")
      shift
    done
    [[ "${1:-}" == "--" ]] && shift
  fi
  items=("$@")

  # If no labels, use items as labels
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
      # Parse comma-separated numbers
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
# Reads a single menu selection character. Returns it.
prompt_menu() {
  local input
  printf "Select: " >&2
  read -r input
  echo "$input"
}
