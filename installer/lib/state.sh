#!/usr/bin/env bash
# state.sh -- Installation state management

INSTALLER_VERSION="0.1.0"

# STATE_FILE is computed dynamically so it respects sandbox HOME changes
_get_state_file() {
  echo "${HOME}/.ows/agent-installer.json"
}

# write_state wallet_name agent_address policy_id key_name allowed_chains installed_agents_json
# Writes state to ~/.ows/agent-installer.json
write_state() {
  local wallet_name="$1"
  local agent_address="$2"
  local policy_id="$3"
  local key_name="$4"
  local allowed_chains="$5"
  local installed_agents_json="$6"
  local installed_at
  installed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local state_file
  state_file="$(_get_state_file)"
  mkdir -p "$(dirname "$state_file")"
  cat > "$state_file" <<STATEEOF
{
  "version": "${INSTALLER_VERSION}",
  "wallet_name": "${wallet_name}",
  "agent_address": "${agent_address}",
  "policy_id": "${policy_id}",
  "key_name": "${key_name}",
  "allowed_chains": ${allowed_chains},
  "installed_agents": ${installed_agents_json},
  "installed_at": "${installed_at}"
}
STATEEOF
}

# read_state
# Reads and validates the state file. Returns 0 if valid, 1 if missing/invalid.
# Sets global STATE_JSON on success.
read_state() {
  local state_file
  state_file="$(_get_state_file)"
  if [[ ! -f "$state_file" ]]; then
    return 1
  fi
  STATE_JSON=$(cat "$state_file")
  # Validate JSON
  if ! echo "$STATE_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    return 1
  fi
  return 0
}

# get_state_field field
# Extracts a single top-level field from the state file.
# Returns the raw value (strings unquoted, arrays as JSON).
get_state_field() {
  local field="$1"
  local state_file
  state_file="$(_get_state_file)"
  if [[ ! -f "$state_file" ]]; then
    return 1
  fi
  python3 -c "
import json, sys
with open('${state_file}') as f:
    data = json.load(f)
val = data.get('${field}')
if val is None:
    sys.exit(1)
if isinstance(val, (list, dict)):
    print(json.dumps(val))
else:
    print(val)
"
}

# detect_installation
# Returns: "none", "complete", or "partial"
detect_installation() {
  local state_file
  state_file="$(_get_state_file)"
  if [[ ! -f "$state_file" ]]; then
    echo "none"
    return 0
  fi
  if ! read_state; then
    echo "partial"
    return 0
  fi
  local wallet_name
  wallet_name=$(get_state_field "wallet_name" 2>/dev/null) || true
  if [[ -z "$wallet_name" ]]; then
    echo "partial"
    return 0
  fi
  # Check key file exists (lightweight check without calling ows)
  local key_file="${HOME}/.ows/${wallet_name}.key"
  if [[ -f "$key_file" ]]; then
    echo "complete"
  else
    echo "partial"
  fi
}

# clear_state
# Removes the state file.
clear_state() {
  rm -f "$(_get_state_file)"
}
