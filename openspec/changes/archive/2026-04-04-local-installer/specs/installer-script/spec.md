## ADDED Requirements

### Requirement: Custom MCP server
The installer SHALL include a custom MCP server at `installer/mcp-server/` built
with `@modelcontextprotocol/sdk` (Node.js). The server SHALL expose OWS signing
operations as MCP tools that agents can call without direct `ows` CLI access.

Initial tools:
- `sign_message`: Signs a message using the agent's OWS wallet. Accepts `message`
  (string) and `chain` (string, default `base`). Returns the signature hex string.
  Internally calls `ows sign message` with the API key from the key file.

The MCP server runs as a stdio process spawned by the agent runtime. It reads
the API key from `~/.ows/<wallet-name>.key` and uses it as `OWS_PASSPHRASE`
when invoking `ows` subprocess commands.

#### Scenario: Agent calls sign_message via MCP
- **WHEN** an agent invokes the `sign_message` MCP tool with `{"message": "hello", "chain": "base"}`
- **THEN** the MCP server reads the API key, calls `ows sign message`, and returns the signature

#### Scenario: MCP server starts with missing key file
- **WHEN** the key file does not exist at the expected path
- **THEN** the MCP server returns an error: "API key file not found"

---

### Requirement: MCP server registration per agent
The installer SHALL register the MCP server with each detected agent using
the agent's native MCP configuration mechanism:

- **OpenClaw**: `openclaw mcp set agent-wallet '{"command":"node","args":["/path/to/mcp-server/index.js"],"env":{"AGENT_WALLET_NAME":"<name>"}}'`
- **Claude Coworker**: `claude mcp add agent-wallet --transport stdio --scope user -- node /path/to/mcp-server/index.js` (or write to `~/.claude.json` if `claude` CLI not in PATH)
- **Codex**: Append `[mcp_servers.agent-wallet]` section to `~/.codex/config.toml`

#### Scenario: MCP registered for OpenClaw
- **WHEN** OpenClaw is detected and user confirms
- **THEN** `openclaw mcp show agent-wallet` returns the server configuration

#### Scenario: MCP registered for Claude Coworker
- **WHEN** Claude Coworker is detected (via `~/.claude/` directory)
- **THEN** the MCP config is written to `~/.claude.json` or via `claude mcp add`

#### Scenario: MCP registered for Codex
- **WHEN** Codex is detected
- **THEN** `~/.codex/config.toml` contains an `[mcp_servers.agent-wallet]` section

---

### Requirement: Skill file teaches MCP tools
The skill SKILL.md SHALL describe the available MCP tools (not `ows` CLI commands).
The agent reads the skill to understand what tools are available and how to use them.
The skill SHALL NOT contain any instructions to call `ows` directly.

#### Scenario: Skill content references MCP tools
- **WHEN** the skill file is generated
- **THEN** it describes the `sign_message` MCP tool with parameters and examples
- **AND** it does NOT contain `ows sign` or `OWS_PASSPHRASE` references

---

### Requirement: Single entry point
The installer SHALL be a single bash script at `installer/install.sh` that
supports both initial installation and ongoing management via an interactive TUI.

#### Scenario: User runs the installer
- **WHEN** user runs `./installer/install.sh`
- **THEN** the script starts an interactive TUI session

---

### Requirement: macOS-only platform check
The installer SHALL verify it is running on macOS (Darwin).

#### Scenario: Running on macOS
- **WHEN** `uname -s` returns `Darwin`
- **THEN** installation proceeds

#### Scenario: Running on non-macOS
- **WHEN** `uname -s` does not return `Darwin`
- **THEN** exits with code 1

---

### Requirement: OWS installation
The installer SHALL check for `ows` in PATH and install if missing.

#### Scenario: OWS already installed
- **WHEN** `command -v ows` succeeds
- **THEN** skips installation, prints version

#### Scenario: OWS not installed
- **WHEN** `command -v ows` fails
- **THEN** installs via official installer, verifies

---

### Requirement: Agent wallet creation with empty passphrase
The installer SHALL create the wallet with an empty passphrase for seamless
agent signing. Security is provided by on-chain AA policies, not local encryption.
The API key is the access credential.

#### Scenario: Wallet created
- **WHEN** installer creates a new wallet
- **THEN** empty passphrase is piped to `ows wallet create`
- **AND** the EVM address is extracted from output

---

### Requirement: Chain-restricted policy
The installer SHALL create an OWS policy restricting to Base + Base Sepolia.
No expiry. Chain list defined as a constant for easy updates.

#### Scenario: Policy created
- **WHEN** installer runs policy creation
- **THEN** policy with `allowed_chains: ["eip155:8453", "eip155:84532"]` is registered

---

### Requirement: Agent API key creation
The installer SHALL create an API key with empty passphrase piped to stdin.
Token saved to `~/.ows/<wallet-name>.key` with 0600 permissions.

#### Scenario: Key created and saved
- **WHEN** key creation succeeds
- **THEN** `ows_key_...` token is written to key file with 0600 perms

---

### Requirement: Node.js dependency check
The MCP server requires Node.js. The installer SHALL verify `node` is in PATH
and exit with a clear error if not found.

#### Scenario: Node.js available
- **WHEN** `command -v node` succeeds
- **THEN** installation continues

#### Scenario: Node.js not available
- **WHEN** `command -v node` fails
- **THEN** prints error with install instructions and exits

---

### Requirement: MCP server npm install
The installer SHALL run `npm install` in the `mcp-server/` directory to install
dependencies (`@modelcontextprotocol/sdk`).

#### Scenario: npm install succeeds
- **WHEN** `npm install` completes in the mcp-server directory
- **THEN** `node_modules/` is created and installation continues

---

### Requirement: Agent detection
Detection logic:
- **OpenClaw**: `command -v openclaw` OR `~/.openclaw/` exists
- **Claude Coworker**: `command -v claude` OR `~/.claude/` exists
- **Codex**: `command -v codex` OR `~/.codex/` exists

#### Scenario: Multiple agents detected
- **WHEN** two or more agents found
- **THEN** lists them with display names, asks which to configure

#### Scenario: No agents detected
- **WHEN** none found
- **THEN** prints warning, continues (MCP server still installed, can register later)

---

### Requirement: Output agent public address
At the end of first-run, print the agent wallet's EVM address and wallet name.

#### Scenario: Successful install
- **WHEN** all steps complete
- **THEN** prints address and wallet name, exits 0

---

### Requirement: Interactive TUI -- management menu
When existing installation detected, show menu:
[1] View status, [2] Update chain policy, [3] Regenerate API key,
[4] Reinstall MCP + skills, [5] Reinstall everything, [6] Uninstall, [q] Quit

#### Scenario: Returning user
- **WHEN** state file and key file exist
- **THEN** management menu displays

---

### Requirement: --reinstall flag
`./install.sh --reinstall` SHALL force full cleanup (including wallet deletion
from OWS, MCP deregistration from agents) and run fresh install.

#### Scenario: Reinstall
- **WHEN** `--reinstall` is passed
- **THEN** all artifacts removed, fresh install runs, agent signing works after

---

### Requirement: --self-test flag
`./install.sh --self-test` SHALL run automated end-to-end test in sandboxed
HOME with real OWS, verifying: install, MCP server start, agent signing via
MCP, reinstall, uninstall.

#### Scenario: Self-test passes
- **WHEN** `--self-test` runs
- **THEN** all phases pass including MCP-based signing verification

---

### Requirement: Clean error handling
Exit codes: 1=platform, 2=OWS install, 3=wallet, 4=key, 5=general.
`set -euo pipefail`. Contextual error messages.

#### Scenario: Error mid-flow
- **WHEN** any step fails
- **THEN** prints error with step context and exits with specific code

---

### Requirement: Idempotent execution
Safe to re-run. State detection drives first-run vs management menu.

#### Scenario: Re-run
- **WHEN** run again after complete install
- **THEN** shows management menu, no duplicate artifacts

---

### Requirement: Non-interactive mode
`AGENT_NON_INTERACTIVE=1` skips all prompts, uses defaults.

#### Scenario: CI-style run
- **WHEN** `AGENT_NON_INTERACTIVE=1`
- **THEN** all defaults used, no prompts
