#!/usr/bin/env bash
# functions.sh -- Core installer functions

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_ALLOWED_CHAINS='["eip155:8453", "eip155:84532", "eip155:11155111"]'
POLICY_ID="agent-chain-only"
KEY_NAME="agent-key"
DEFAULT_WALLET_NAME="agent-wallet"

# get_factory_address -- reads AbstractAccountFactory address from contracts/deployments/sepolia.json
get_factory_address() {
  local deploy_json="${INSTALLER_LIB_DIR%/lib}/../contracts/deployments/sepolia.json"
  if [[ -f "$deploy_json" ]]; then
    python3 -c "
import json
with open('${deploy_json}') as f:
    d = json.load(f)
print(d['contracts']['AbstractAccountFactory']['address'])
" 2>/dev/null
  fi
}

# get_agent_display_name agent_type
get_agent_display_name() {
  case "$1" in
    openclaw) echo "OpenClaw" ;;
    claude)   echo "Claude Code/Cowork" ;;
    codex)    echo "Codex" ;;
    *)        echo "$1" ;;
  esac
}

# Resolve the installer lib directory (where templates live)
# This is set by install.sh before sourcing this file
: "${INSTALLER_LIB_DIR:=""}"

# ---------------------------------------------------------------------------
# Platform
# ---------------------------------------------------------------------------

# detect_platform -- exits with code 1 if not macOS
detect_platform() {
  local platform
  platform="$(uname -s)"
  if [[ "$platform" != "Darwin" ]]; then
    print_error "This installer only supports macOS (detected: ${platform})"
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# OWS
# ---------------------------------------------------------------------------

# check_ows_installed -- returns 0 if ows is in PATH
check_ows_installed() {
  command -v ows &>/dev/null
}

# install_ows -- installs OWS via official installer (with output)
install_ows() {
  if ! curl -fsSL https://docs.openwallet.sh/install.sh | bash; then
    print_error "Failed to install OWS. Visit https://openwallet.sh for help."
    return 1
  fi
  # Reload PATH to pick up newly installed binary
  export PATH="${HOME}/.ows/bin:${PATH}"
  if ! command -v ows &>/dev/null; then
    print_error "OWS installed but 'ows' not found in PATH."
    return 1
  fi
}

# install_ows_quiet -- installs OWS with output captured (for TUI spinner)
install_ows_quiet() {
  local _out_file
  _out_file=$(mktemp)
  if curl -fsSL https://docs.openwallet.sh/install.sh 2>/dev/null | bash > "$_out_file" 2>&1; then
    rm -f "$_out_file"
  else
    # Show captured output on failure
    if [[ -s "$_out_file" ]]; then
      while IFS= read -r line; do
        printf "    ${_DIM}%s${_RESET}\n" "$line" >&2
      done < "$_out_file"
    fi
    rm -f "$_out_file"
    return 1
  fi
  # Reload PATH to pick up newly installed binary
  export PATH="${HOME}/.ows/bin:${PATH}"
  if ! command -v ows &>/dev/null; then
    return 1
  fi
}

# remove_ows_skills -- removes OWS skill files from all known agent directories
# The OWS installer drops SKILL.md + references into every detected agent's
# skill dir. We use MCP instead, so these are dead weight.
remove_ows_skills() {
  local dirs=(
    "${HOME}/.agents/skills/ows"
    "${HOME}/.claude/skills/ows"
    "${HOME}/.config/agents/skills/ows"
    "${HOME}/.cursor/skills/ows"
    "${HOME}/.copilot/skills/ows"
    "${HOME}/.codex/skills/ows"
    "${HOME}/.gemini/skills/ows"
    "${HOME}/.config/opencode/skills/ows"
    "${HOME}/.config/goose/skills/ows"
    "${HOME}/.windsurf/skills/ows"
    "${HOME}/.codeium/windsurf/skills/ows"
    "${HOME}/.continue/skills/ows"
    "${HOME}/.roo/skills/ows"
    "${HOME}/.kiro/skills/ows"
    "${HOME}/.augment/skills/ows"
    "${HOME}/.trae/skills/ows"
  )
  for dir in "${dirs[@]}"; do
    if [[ -d "$dir" ]]; then
      rm -rf "$dir"
    fi
  done
}

# remove_ows_mcp -- removes any "ows" MCP server entries from agent configs
# OWS does not currently register MCP servers, but this is defensive against
# future OWS versions that might. Strips "ows" key from MCP config sections.
remove_ows_mcp() {
  # OpenClaw: mcp.servers.ows in JSON
  local openclaw_config="${HOME}/.openclaw/openclaw.json"
  if [[ -f "$openclaw_config" ]]; then
    python3 -c "
import json
with open('${openclaw_config}') as f:
    cfg = json.load(f)
if 'mcp' in cfg and 'servers' in cfg['mcp']:
    cfg['mcp']['servers'].pop('ows', None)
with open('${openclaw_config}', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi

  # Claude Code: try CLI first, then manual config
  if command -v claude &>/dev/null; then
    claude mcp remove ows &>/dev/null || true
  fi
  local claude_config="${HOME}/.claude.json"
  if [[ -f "$claude_config" ]]; then
    python3 -c "
import json
with open('${claude_config}') as f:
    cfg = json.load(f)
changed = False
if 'mcpServers' in cfg:
    if 'ows' in cfg['mcpServers']:
        del cfg['mcpServers']['ows']
        changed = True
# Also check per-project configs
for key in list(cfg.keys()):
    if key.startswith('/') and isinstance(cfg[key], dict):
        servers = cfg[key].get('mcpServers', {})
        if 'ows' in servers:
            del servers['ows']
            changed = True
if changed:
    with open('${claude_config}', 'w') as f:
        json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi

  # Claude Desktop
  local desktop_config="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
  if [[ -f "$desktop_config" ]]; then
    python3 -c "
import json
with open('${desktop_config}') as f:
    cfg = json.load(f)
if 'mcpServers' in cfg and 'ows' in cfg['mcpServers']:
    del cfg['mcpServers']['ows']
    with open('${desktop_config}', 'w') as f:
        json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi

  # Codex: [mcp_servers.ows] in TOML
  local codex_config="${HOME}/.codex/config.toml"
  if [[ -f "$codex_config" ]] && grep -q '\[mcp_servers\.ows\]' "$codex_config" 2>/dev/null; then
    python3 -c "
import re
with open('${codex_config}') as f:
    content = f.read()
content = re.sub(r'\n?\[mcp_servers\.ows\].*?(?=\n\[|\Z)', '', content, flags=re.DOTALL)
with open('${codex_config}', 'w') as f:
    f.write(content.rstrip() + '\n')
" 2>/dev/null || true
  fi

  # OpenCode: mcp.servers.ows or mcpServers.ows in JSON
  local opencode_config="${HOME}/.config/opencode/config.json"
  if [[ -f "$opencode_config" ]]; then
    python3 -c "
import json
with open('${opencode_config}') as f:
    cfg = json.load(f)
changed = False
if 'mcp' in cfg and 'servers' in cfg['mcp'] and 'ows' in cfg['mcp']['servers']:
    del cfg['mcp']['servers']['ows']
    changed = True
if 'mcpServers' in cfg and 'ows' in cfg['mcpServers']:
    del cfg['mcpServers']['ows']
    changed = True
if changed:
    with open('${opencode_config}', 'w') as f:
        json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi
}

# clean_ows_agent_artifacts -- removes all OWS-installed agent artifacts
# Combines skill file removal + MCP deregistration. Called unconditionally
# during install (whether OWS was pre-existing or freshly installed) and
# during uninstall.
clean_ows_agent_artifacts() {
  remove_ows_skills
  remove_ows_mcp
}

# uninstall_ows -- removes OWS binary, PATH entries, and language bindings
# Optionally purges vault data (~/.ows/).
uninstall_ows() {
  local purge="${1:-false}"
  if ! command -v ows &>/dev/null; then
    return 0
  fi
  # Pipe 'y' to confirm -- ows uninstall has no --confirm flag
  if [[ "$purge" == "true" ]]; then
    echo "y" | ows uninstall --purge 2>/dev/null || true
  else
    echo "y" | ows uninstall 2>/dev/null || true
  fi
  # Remove all OWS agent artifacts (skills + MCP)
  clean_ows_agent_artifacts
}

# get_ows_version -- prints OWS version string
get_ows_version() {
  ows --version 2>/dev/null || echo "unknown"
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# _extract_evm_address output_text
# Extracts the first 0x EVM address from OWS output (handles both → and space separators).
_extract_evm_address() {
  local output="$1"
  # Try to find 0x address on an eip155 line
  local addr
  addr=$(echo "$output" | grep -E "eip155:" | head -1 | grep -oE "0x[0-9a-fA-F]{40}" | head -1)
  if [[ -n "$addr" ]]; then
    echo "$addr"
    return 0
  fi
  # Fallback: find any 0x address anywhere in output
  addr=$(echo "$output" | grep -oE "0x[0-9a-fA-F]{40}" | head -1)
  echo "$addr"
}

# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------

# create_wallet wallet_name [--use-existing]
# Creates an OWS wallet and prints the EVM address to stdout.
# If --use-existing is passed, silently reuse an existing wallet without prompting.
# Returns 0 on success, 3 on failure.
create_wallet() {
  local wallet_name="$1"
  local use_existing=false
  if [[ "${2:-}" == "--use-existing" ]]; then
    use_existing=true
  fi

  # Check if wallet already exists
  local wallet_list
  wallet_list=$(ows wallet list 2>/dev/null || true)
  if echo "$wallet_list" | grep -q "Name:.*${wallet_name}$"; then
    local should_use=false
    if [[ "$use_existing" == "true" ]]; then
      should_use=true
    elif prompt_confirm "Wallet '${wallet_name}' already exists. Use it?"; then
      should_use=true
    fi
    if [[ "$should_use" == "true" ]]; then
      # Extract EVM address from wallet list output.
      # For multiple wallets, isolate the section for our wallet by taking
      # lines from "Name: <wallet_name>" until the next blank line or EOF,
      # then extract the eip155 address from that section.
      local wallet_section addr
      wallet_section=$(echo "$wallet_list" | sed -n "/Name:.*${wallet_name}$/,/^$/p")
      addr=$(_extract_evm_address "$wallet_section")
      if [[ -n "$addr" ]]; then
        echo "$addr"
        return 0
      fi
      print_error "Could not extract EVM address from existing wallet."
      return 3
    else
      return 3
    fi
  fi

  # Create new wallet with empty passphrase for seamless agent signing.
  # Security is provided by the on-chain AA policies, not local encryption.
  # The API key (ows_key_) is the access credential for the agent.
  local output
  output=$(echo "" | OWS_PASSPHRASE="" ows wallet create --name "$wallet_name" 2>&1) || {
    print_error "Wallet creation failed: ${output}"
    return 3
  }

  local addr
  addr=$(_extract_evm_address "$output")

  if [[ -z "$addr" ]]; then
    print_error "Wallet created but could not extract EVM address from output."
    return 3
  fi

  echo "$addr"
}

# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

# create_policy [chain_ids_json]
# Creates an OWS chain restriction policy. Uses DEFAULT_ALLOWED_CHAINS if no arg.
create_policy() {
  local chain_ids="${1:-$DEFAULT_ALLOWED_CHAINS}"

  # Check if policy already exists
  if ows policy show --id "$POLICY_ID" &>/dev/null; then
    print_warning "Policy '${POLICY_ID}' already exists, reusing."
    return 0
  fi

  local created_at
  created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local tmpfile
  tmpfile="$(mktemp)"

  # Read template and substitute
  if [[ -n "$INSTALLER_LIB_DIR" ]] && [[ -f "${INSTALLER_LIB_DIR}/policy-template.json" ]]; then
    sed -e "s|{{POLICY_ID}}|${POLICY_ID}|g" \
        -e "s|{{CREATED_AT}}|${created_at}|g" \
        -e "s|{{CHAIN_IDS}}|${chain_ids}|g" \
        "${INSTALLER_LIB_DIR}/policy-template.json" > "$tmpfile"
  else
    # Inline fallback if template not found
    cat > "$tmpfile" <<PEOF
{
  "id": "${POLICY_ID}",
  "name": "Agent chain restriction",
  "version": 1,
  "created_at": "${created_at}",
  "rules": [
    {
      "type": "allowed_chains",
      "chain_ids": ${chain_ids}
    }
  ],
  "action": "deny"
}
PEOF
  fi

  local result
  result=$(ows policy create --file "$tmpfile" 2>&1) || {
    rm -f "$tmpfile"
    print_error "Policy creation failed: ${result}"
    return 1
  }
  rm -f "$tmpfile"
  return 0
}

# delete_policy
# Deletes the chain restriction policy.
delete_policy() {
  ows policy delete --id "$POLICY_ID" --confirm 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# API Key
# ---------------------------------------------------------------------------

# create_api_key wallet_name
# Creates an OWS API key and saves the token to ~/.ows/<wallet_name>.key
# Prints the key file path to stdout.
#
# Wallets are created with empty passphrase, so key creation also uses empty passphrase.
create_api_key() {
  local wallet_name="$1"
  local key_file="${HOME}/.ows/${wallet_name}.key"

  local output
  # Pipe empty passphrase -- wallet was created with empty passphrase
  output=$(echo "" | OWS_PASSPHRASE="" \
    ows key create --name "$KEY_NAME" --wallet "$wallet_name" --policy "$POLICY_ID" 2>&1) || {
    print_error "API key creation failed: ${output}"
    return 1
  }

  # Extract the ows_key_ token from output
  local token
  token=$(echo "$output" | grep -oE "ows_key_[0-9a-zA-Z_]+" | head -1)

  if [[ -z "$token" ]]; then
    print_error "API key created but could not extract token from output."
    return 1
  fi

  # Write token to file with restricted permissions
  mkdir -p "$(dirname "$key_file")"
  printf '%s' "$token" > "$key_file"
  chmod 600 "$key_file"

  echo "$key_file"
}

# revoke_api_key
# Revokes the existing agent API key (best-effort, tries by name).
revoke_api_key() {
  # Try revoking by name -- may fail if OWS uses UUIDs
  ows key revoke --id "$KEY_NAME" --confirm 2>/dev/null || true
}

# delete_key_file wallet_name
# Removes the API key file from disk.
delete_key_file() {
  local wallet_name="$1"
  rm -f "${HOME}/.ows/${wallet_name}.key"
}

# ---------------------------------------------------------------------------
# Agent Detection
# ---------------------------------------------------------------------------

# detect_agents
# Prints space-separated list of detected agent types: opencode claude codex
detect_agents() {
  local agents=""
  if command -v openclaw &>/dev/null || [[ -d "${HOME}/.openclaw" ]]; then
    agents="${agents:+$agents }openclaw"
  fi
  if command -v claude &>/dev/null || [[ -d "${HOME}/.claude" ]]; then
    agents="${agents:+$agents }claude"
  fi
  if command -v codex &>/dev/null || [[ -d "${HOME}/.codex" ]]; then
    agents="${agents:+$agents }codex"
  fi
  echo "$agents"
}

# build_agents_json agents_list
# Builds JSON array of agent type strings for state file.
build_agents_json() {
  local agents_str="$1"
  local json="["
  local first=true
  for agent in $agents_str; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      json+=","
    fi
    json+="\"${agent}\""
  done
  json+="]"
  echo "$json"
}

# ---------------------------------------------------------------------------
# Node.js / MCP Server
# ---------------------------------------------------------------------------

# check_node_installed -- returns 0 if node is in PATH
check_node_installed() {
  command -v node &>/dev/null
}

# get_mcp_server_path -- returns absolute path to the MCP server index.js
get_mcp_server_path() {
  local script_dir="${INSTALLER_LIB_DIR%/lib}"
  echo "${script_dir}/mcp-server/index.js"
}

# install_mcp_deps -- runs npm install in mcp-server directory (with output)
install_mcp_deps() {
  local mcp_dir
  mcp_dir="$(dirname "$(get_mcp_server_path)")"
  if [[ ! -f "${mcp_dir}/package.json" ]]; then
    print_error "MCP server package.json not found at ${mcp_dir}"
    return 1
  fi
  (cd "$mcp_dir" && npm install --silent 2>&1) || {
    print_error "Failed to install MCP server dependencies."
    return 1
  }
}

# install_mcp_deps_quiet -- runs npm install with output captured (for TUI spinner)
install_mcp_deps_quiet() {
  local mcp_dir
  mcp_dir="$(dirname "$(get_mcp_server_path)")"
  if [[ ! -f "${mcp_dir}/package.json" ]]; then
    return 1
  fi
  local _out_file
  _out_file=$(mktemp)
  if (cd "$mcp_dir" && npm install --silent > "$_out_file" 2>&1); then
    rm -f "$_out_file"
  else
    if [[ -s "$_out_file" ]]; then
      while IFS= read -r line; do
        printf "    ${_DIM}%s${_RESET}\n" "$line" >&2
      done < "$_out_file"
    fi
    rm -f "$_out_file"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# MCP Registration
# ---------------------------------------------------------------------------

# _mcp_server_json wallet_name
# Returns the MCP server JSON config for agent registration.
_mcp_server_json() {
  local wallet_name="$1"
  local server_path factory_addr
  server_path="$(get_mcp_server_path)"
  factory_addr="$(get_factory_address)"
  if [[ -n "$factory_addr" ]]; then
    printf '{"command":"node","args":["%s"],"env":{"AGENT_WALLET_NAME":"%s","FACTORY_ADDRESS":"%s"}}' "$server_path" "$wallet_name" "$factory_addr"
  else
    printf '{"command":"node","args":["%s"],"env":{"AGENT_WALLET_NAME":"%s"}}' "$server_path" "$wallet_name"
  fi
}

# register_mcp agent_type wallet_name
# Registers the MCP server with the given agent.
register_mcp() {
  local agent_type="$1" wallet_name="$2"
  case "$agent_type" in
    openclaw) register_mcp_openclaw "$wallet_name" ;;
    claude)   register_mcp_claude "$wallet_name" ;;
    codex)    register_mcp_codex "$wallet_name" ;;
    *) print_warning "Unknown agent type for MCP: ${agent_type}" ;;
  esac
}

# register_mcp_openclaw wallet_name
register_mcp_openclaw() {
  local wallet_name="$1"
  local json
  json=$(_mcp_server_json "$wallet_name")
  if command -v openclaw &>/dev/null; then
    if openclaw mcp set agent-wallet "$json" &>/dev/null; then
      return 0
    fi
  fi
  # Fallback: write config file directly (correct key path: mcp.servers)
  _write_openclaw_mcp_json "$wallet_name"
}

_write_openclaw_mcp_json() {
  local wallet_name="$1"
  local config_file="${HOME}/.openclaw/openclaw.json"
  local server_path factory_addr
  server_path="$(get_mcp_server_path)"
  factory_addr="$(get_factory_address)"
  mkdir -p "$(dirname "$config_file")"
  # OpenClaw config uses "mcp": { "servers": { ... } } (not "mcpServers")
  if [[ -f "$config_file" ]]; then
    python3 -c "
import json, sys
try:
    with open('${config_file}') as f:
        cfg = json.load(f)
except:
    cfg = {}
if 'mcp' not in cfg:
    cfg['mcp'] = {}
if 'servers' not in cfg['mcp']:
    cfg['mcp']['servers'] = {}
env = {'AGENT_WALLET_NAME': '${wallet_name}'}
fa = '${factory_addr}'
if fa:
    env['FACTORY_ADDRESS'] = fa
cfg['mcp']['servers']['agent-wallet'] = {
    'command': 'node',
    'args': ['${server_path}'],
    'env': env
}
with open('${config_file}', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || print_warning "Could not update ${config_file}"
  else
    local env_json
    if [[ -n "$factory_addr" ]]; then
      env_json="\"AGENT_WALLET_NAME\": \"${wallet_name}\", \"FACTORY_ADDRESS\": \"${factory_addr}\""
    else
      env_json="\"AGENT_WALLET_NAME\": \"${wallet_name}\""
    fi
    cat > "$config_file" <<MCPEOF
{
  "mcp": {
    "servers": {
      "agent-wallet": {
        "command": "node",
        "args": ["${server_path}"],
        "env": {${env_json}}
      }
    }
  }
}
MCPEOF
  fi
}

# register_mcp_claude wallet_name
# Claude Code/Cowork uses claude_desktop_config.json for MCP servers.
# Claude Code CLI uses ~/.claude.json via `claude mcp add`.
register_mcp_claude() {
  local wallet_name="$1"
  local server_path factory_addr
  server_path="$(get_mcp_server_path)"
  factory_addr="$(get_factory_address)"

  # Try Claude Code CLI first
  if command -v claude &>/dev/null; then
    local env_flags=("--env" "AGENT_WALLET_NAME=${wallet_name}")
    if [[ -n "$factory_addr" ]]; then
      env_flags+=("--env" "FACTORY_ADDRESS=${factory_addr}")
    fi
    claude mcp add agent-wallet --transport stdio --scope user \
      "${env_flags[@]}" \
      -- node "$server_path" &>/dev/null || true
  fi

  # Also write to Claude Desktop/Coworker config (VM uses this)
  local desktop_config="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
  if [[ -d "$(dirname "$desktop_config")" ]]; then
    if [[ -f "$desktop_config" ]]; then
      python3 -c "
import json
with open('${desktop_config}') as f:
    cfg = json.load(f)
if 'mcpServers' not in cfg:
    cfg['mcpServers'] = {}
env = {'AGENT_WALLET_NAME': '${wallet_name}'}
fa = '${factory_addr}'
if fa:
    env['FACTORY_ADDRESS'] = fa
cfg['mcpServers']['agent-wallet'] = {
    'command': 'node',
    'args': ['${server_path}'],
    'env': env
}
with open('${desktop_config}', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || print_warning "Could not update Claude Desktop config"
    fi
  fi
}

# register_mcp_codex wallet_name
register_mcp_codex() {
  local wallet_name="$1"
  local server_path factory_addr
  server_path="$(get_mcp_server_path)"
  factory_addr="$(get_factory_address)"
  local config_file="${HOME}/.codex/config.toml"
  mkdir -p "$(dirname "$config_file")"

  # Check if section already exists
  if [[ -f "$config_file" ]] && grep -q '\[mcp_servers\.agent-wallet\]' "$config_file" 2>/dev/null; then
    # Remove old section and re-add
    python3 -c "
import re
with open('${config_file}') as f:
    content = f.read()
# Remove existing agent-wallet section
content = re.sub(r'\[mcp_servers\.agent-wallet\].*?(?=\n\[|\Z)', '', content, flags=re.DOTALL)
with open('${config_file}', 'w') as f:
    f.write(content.rstrip() + '\n')
" 2>/dev/null
  fi

  # Append MCP server config
  local env_toml
  if [[ -n "$factory_addr" ]]; then
    env_toml="{ AGENT_WALLET_NAME = \"${wallet_name}\", FACTORY_ADDRESS = \"${factory_addr}\" }"
  else
    env_toml="{ AGENT_WALLET_NAME = \"${wallet_name}\" }"
  fi
  cat >> "$config_file" <<CODEXEOF

[mcp_servers.agent-wallet]
command = "node"
args = ["${server_path}"]
environment = ${env_toml}
CODEXEOF
}

# deregister_mcp agent_type
# Removes MCP registration for the given agent.
deregister_mcp() {
  local agent_type="$1"
  case "$agent_type" in
    openclaw) deregister_mcp_openclaw ;;
    claude)   deregister_mcp_claude ;;
    codex)    deregister_mcp_codex ;;
  esac
}

deregister_mcp_openclaw() {
  if command -v openclaw &>/dev/null; then
    openclaw mcp unset agent-wallet &>/dev/null || true
  fi
  # Also remove from config file directly (key path: mcp.servers)
  local config_file="${HOME}/.openclaw/openclaw.json"
  if [[ -f "$config_file" ]]; then
    python3 -c "
import json
with open('${config_file}') as f:
    cfg = json.load(f)
if 'mcp' in cfg and 'servers' in cfg['mcp']:
    cfg['mcp']['servers'].pop('agent-wallet', None)
with open('${config_file}', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi
}

deregister_mcp_claude() {
  if command -v claude &>/dev/null; then
    claude mcp remove agent-wallet &>/dev/null || true
  fi
  # Remove from Claude Desktop config
  local desktop_config="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
  if [[ -f "$desktop_config" ]]; then
    python3 -c "
import json
with open('${desktop_config}') as f:
    cfg = json.load(f)
if 'mcpServers' in cfg:
    cfg['mcpServers'].pop('agent-wallet', None)
with open('${desktop_config}', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || true
  fi
}

deregister_mcp_codex() {
  local config_file="${HOME}/.codex/config.toml"
  if [[ -f "$config_file" ]]; then
    python3 -c "
import re
with open('${config_file}') as f:
    content = f.read()
content = re.sub(r'\n?\[mcp_servers\.agent-wallet\].*?(?=\n\[|\Z)', '', content, flags=re.DOTALL)
with open('${config_file}', 'w') as f:
    f.write(content.rstrip() + '\n')
" 2>/dev/null || true
  fi
}

# deregister_all_mcp
# Removes MCP registration from all known agents.
deregister_all_mcp() {
  deregister_mcp_openclaw
  deregister_mcp_claude
  deregister_mcp_codex
}

# ---------------------------------------------------------------------------
# Management Operations
# ---------------------------------------------------------------------------

# show_status
# Displays current installation status.
show_status() {
  if ! read_state; then
    print_error "No installation state found."
    return 1
  fi
  local wallet_name agent_address policy_id key_name allowed_chains agents_json
  wallet_name=$(get_state_field "wallet_name")
  agent_address=$(get_state_field "agent_address")
  policy_id=$(get_state_field "policy_id")
  key_name=$(get_state_field "key_name")
  allowed_chains=$(get_state_field "allowed_chains")
  agents_json=$(get_state_field "installed_agents")
  local installed_at
  installed_at=$(get_state_field "installed_at")
  local version
  version=$(get_state_field "version")

  printf "\n${_BOLD}Installation Status${_RESET}\n"
  printf "%-20s %s\n" "Installer version:" "$version"
  printf "%-20s %s\n" "Installed at:" "$installed_at"
  printf "%-20s %s\n" "OWS version:" "$(get_ows_version)"
  printf "%-20s %s\n" "Wallet name:" "$wallet_name"
  printf "%-20s %s\n" "Agent address:" "$agent_address"
  printf "%-20s %s\n" "Policy ID:" "$policy_id"
  printf "%-20s %s\n" "Allowed chains:" "$allowed_chains"
  printf "%-20s %s\n" "API key name:" "$key_name"
  printf "%-20s %s\n" "Agents:" "$agents_json"
  printf "\n"
}

# update_policy
# Interactive policy update: change allowed chains.
update_policy() {
  if ! read_state; then
    print_error "No installation state found."
    return 1
  fi
  local wallet_name policy_id current_chains
  wallet_name=$(get_state_field "wallet_name")
  policy_id=$(get_state_field "policy_id")
  current_chains=$(get_state_field "allowed_chains")

  printf "Current allowed chains: %s\n" "$current_chains"
  printf "Enter new chain IDs (comma-separated CAIP-2, e.g., eip155:8453,eip155:42161)\n"

  local input
  if [[ "${AGENT_NON_INTERACTIVE:-0}" == "1" ]]; then
    print_warning "Cannot update policy in non-interactive mode."
    return 1
  fi
  printf "Chains: " >&2
  read -r input
  if [[ -z "$input" ]]; then
    print_warning "No input. Policy unchanged."
    return 0
  fi

  # Convert comma-separated to JSON array
  local new_chains="["
  local first=true
  IFS=',' read -ra chain_arr <<< "$input"
  for chain in "${chain_arr[@]}"; do
    chain=$(echo "$chain" | xargs)  # trim whitespace
    if [[ "$first" == "true" ]]; then
      first=false
    else
      new_chains+=","
    fi
    new_chains+="\"${chain}\""
  done
  new_chains+="]"

  # Delete old policy, create new
  delete_policy
  create_policy "$new_chains" || return 1

  # Regenerate API key (must be attached to new policy)
  revoke_api_key
  local key_file
  key_file=$(create_api_key "$wallet_name") || return 1

  # Update state
  local agents_json
  agents_json=$(get_state_field "installed_agents")
  write_state "$wallet_name" "$(get_state_field "agent_address")" "$POLICY_ID" "$KEY_NAME" "$new_chains" "$agents_json"

  print_success "Policy updated. API key regenerated."
}

# regenerate_key
# Revokes old key, creates new one at same file path.
regenerate_key() {
  if ! read_state; then
    print_error "No installation state found."
    return 1
  fi
  local wallet_name
  wallet_name=$(get_state_field "wallet_name")

  if ! prompt_confirm "Regenerate API key? The old key will be revoked."; then
    return 0
  fi

  revoke_api_key
  local key_file
  key_file=$(create_api_key "$wallet_name") || return 1

  print_success "API key regenerated. Saved to ${key_file}"
}

# reinstall_mcp
# Re-detects agents and re-registers MCP server.
reinstall_mcp() {
  if ! read_state; then
    print_error "No installation state found."
    return 1
  fi
  local wallet_name
  wallet_name=$(get_state_field "wallet_name")

  # Deregister from all first
  deregister_all_mcp

  local agents_str
  agents_str=$(detect_agents)
  if [[ -z "$agents_str" ]]; then
    print_warning "No supported agents detected."
    return 0
  fi

  # Build display labels
  local agent_labels=()
  for a in $agents_str; do
    agent_labels+=("$(get_agent_display_name "$a")")
  done
  local selected
  # shellcheck disable=SC2086
  selected=$(prompt_select --labels "${agent_labels[@]}" -- $agents_str)
  if [[ -z "$selected" ]]; then
    print_warning "No agents selected."
    return 0
  fi

  for agent in $selected; do
    register_mcp "$agent" "$wallet_name"
    print_success "MCP registered for $(get_agent_display_name "$agent")"
  done

  # Update state with new agent list
  local agents_json
  agents_json=$(build_agents_json "$selected")
  local agent_address allowed_chains
  agent_address=$(get_state_field "agent_address")
  allowed_chains=$(get_state_field "allowed_chains")
  write_state "$wallet_name" "$agent_address" "$POLICY_ID" "$KEY_NAME" "$allowed_chains" "$agents_json"
}

# fresh_reinstall
# Full uninstall + fresh first-run. Keeps OWS since it will be reused.
fresh_reinstall() {
  if ! prompt_confirm "This will delete your agent wallet, keys, and MCP config. Continue?" "n"; then
    return 0
  fi
  do_uninstall_cleanup --keep-ows
  return 2  # Signal to caller to run first-run flow
}

# full_uninstall
# Removes all artifacts.
full_uninstall() {
  printf "This will permanently delete your agent wallet, keys, policies, and MCP config.\n"
  if [[ "${AGENT_NON_INTERACTIVE:-0}" == "1" ]]; then
    do_uninstall_cleanup
    print_success "Uninstall complete."
    return 0
  fi
  printf "Type 'UNINSTALL' to confirm: " >&2
  local input
  read -r input
  if [[ "$input" != "UNINSTALL" ]]; then
    print_warning "Uninstall cancelled."
    return 0
  fi
  do_uninstall_cleanup
  print_success "Uninstall complete."
}

# do_uninstall_cleanup [--keep-ows]
# Internal: performs the actual uninstall steps.
# Removes: wallet, policy, key, MCP registrations, OWS skills, state.
# Unless --keep-ows is passed, also removes OWS binary + vault + bindings.
do_uninstall_cleanup() {
  local keep_ows=false
  if [[ "${1:-}" == "--keep-ows" ]]; then
    keep_ows=true
  fi

  if read_state; then
    local wallet_name
    wallet_name=$(get_state_field "wallet_name")
    local agents_json
    agents_json=$(get_state_field "installed_agents")

    # Revoke API key
    revoke_api_key

    # Delete key file
    rm -f "${HOME}/.ows/${wallet_name}.key"

    # Delete policy
    delete_policy

    # Delete wallet (pipe empty passphrase for non-interactive deletion)
    echo "" | OWS_PASSPHRASE="" ows wallet delete --wallet "$wallet_name" --confirm 2>/dev/null || true

    # Deregister MCP from all agents
    deregister_all_mcp
  fi

  # Remove all OWS agent artifacts (skills + MCP entries)
  clean_ows_agent_artifacts

  # Uninstall OWS itself (binary, PATH entries, language bindings, vault data)
  if [[ "$keep_ows" != "true" ]]; then
    uninstall_ows "true"
  fi

  # Clear state
  clear_state
}
