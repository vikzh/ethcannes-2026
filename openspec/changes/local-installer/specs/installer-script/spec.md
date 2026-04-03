## ADDED Requirements

### Requirement: Single entry point
The installer SHALL be a single bash script at `installer/install.sh` that is
executable and self-contained. All generated files (skill templates, policy JSON)
SHALL be embedded in the script or sourced from `installer/lib/`. The script SHALL
support both initial installation and ongoing management via an interactive TUI.

#### Scenario: User runs the one-liner
- **WHEN** user runs `bash <(curl -fsSL https://<domain>/install.sh)`
- **THEN** the script starts an interactive TUI session in the terminal

#### Scenario: Script is run directly from local checkout
- **WHEN** user runs `./installer/install.sh` from the repo root
- **THEN** the script behaves identically to the curl-pipe-bash invocation

---

### Requirement: Self-verifying install one-liner
The install one-liner SHALL download the script to a temp file, verify its SHA256
hash against a known value, and only execute if the hash matches. Format:
`curl -fsSL <url>/install.sh -o /tmp/aw-install.sh && echo "<hash> /tmp/aw-install.sh" | shasum -a 256 -c && bash /tmp/aw-install.sh`

#### Scenario: Hash matches
- **WHEN** the downloaded script's SHA256 matches the expected hash
- **THEN** the script executes normally

#### Scenario: Hash mismatch (tampered script)
- **WHEN** the downloaded script's SHA256 does not match
- **THEN** `shasum -c` prints "FAILED" and bash does not execute the script

---

### Requirement: macOS-only platform check
The installer SHALL verify it is running on macOS (Darwin) and exit with a clear
error message on any other platform.

#### Scenario: Running on macOS
- **WHEN** `uname -s` returns `Darwin`
- **THEN** installation proceeds normally

#### Scenario: Running on Linux
- **WHEN** `uname -s` returns `Linux`
- **THEN** the script prints "Error: This installer only supports macOS" and exits with code 1

---

### Requirement: Interactive TUI -- first run
When no existing installation is detected (no agent wallet in `~/.ows/`), the
installer SHALL present a guided step-by-step TUI that walks the user through:
1. OWS check/install
2. Wallet creation (prompt for name, passphrase handled by OWS)
3. Chain policy setup
4. API key generation
5. Agent detection and skill installation
6. Output of agent public address

Each step SHALL display a progress indicator (e.g., `[1/6]`) and a status
symbol on completion (checkmark or X).

#### Scenario: First run happy path
- **WHEN** user runs the installer with no prior installation
- **THEN** the TUI walks through all 6 steps sequentially with prompts
- **AND** ends by printing the agent's EVM address and wallet name

#### Scenario: User aborts mid-flow
- **WHEN** user presses Ctrl+C during any step
- **THEN** the script exits cleanly, partial state (e.g., wallet created but no key) is left in place
- **AND** re-running the script detects the partial state and offers to resume or start fresh

---

### Requirement: Interactive TUI -- management menu
When an existing installation is detected (agent wallet exists, API key file present),
the installer SHALL present a management menu:
```
[1] View status
[2] Update chain policy
[3] Regenerate API key
[4] Reinstall skills
[5] Reinstall everything (fresh)
[6] Uninstall
[q] Quit
```

The user selects an option by number. Each option runs its operation and returns
to the menu unless it is a terminal action (uninstall, quit).

#### Scenario: Returning user sees management menu
- **WHEN** the installer detects an existing wallet and API key
- **THEN** it displays the management menu instead of the first-run flow

#### Scenario: User selects an option
- **WHEN** user enters `1` at the menu prompt
- **THEN** the "View status" operation runs and the menu re-displays

#### Scenario: Invalid input
- **WHEN** user enters an unrecognized character
- **THEN** the script prints "Invalid selection" and re-displays the menu

---

### Requirement: OWS installation
The installer SHALL check if the `ows` binary is available in PATH. If not present,
it SHALL install OWS using the official installer
(`curl -fsSL https://docs.openwallet.sh/install.sh | bash`). After installation,
it SHALL verify the binary is available.

Reference: OWS quickstart (submodules/open-wallet-standard/docs/quickstart.md)

#### Scenario: OWS already installed
- **WHEN** `command -v ows` succeeds
- **THEN** the script skips OWS installation and prints the detected version

#### Scenario: OWS not installed
- **WHEN** `command -v ows` fails
- **THEN** the script installs OWS via the official installer, verifies `ows --version` succeeds, and continues

#### Scenario: OWS installation fails
- **WHEN** the OWS installer returns non-zero or `ows --version` fails after install
- **THEN** the script prints "Error: Failed to install OWS" with troubleshooting URL and exits with code 2

---

### Requirement: Agent wallet creation
The installer SHALL create a dedicated OWS wallet. The wallet name SHALL be
prompted interactively (default: `agent-wallet`). The script SHALL capture the
EVM address from the creation output.

Reference: OWS CLI wallet create (submodules/open-wallet-standard/docs/sdk-cli.md)

Trust boundary: The wallet passphrase is entered interactively by the user via the
OWS CLI prompt. The installer script never sees or stores the passphrase.

#### Scenario: Wallet created successfully
- **WHEN** the user provides a wallet name and passphrase via OWS interactive prompt
- **THEN** `ows wallet create --name "<name>"` succeeds and the script extracts the EVM address

#### Scenario: Wallet name already exists
- **WHEN** a wallet with the given name already exists in `~/.ows/wallets/`
- **THEN** the script asks: "Wallet '<name>' already exists. Use it? [Y/n]"
- **AND** if Y, retrieves the existing wallet's EVM address via `ows wallet info`
- **AND** if n, prompts for a different wallet name

#### Scenario: Wallet creation fails
- **WHEN** `ows wallet create` returns non-zero
- **THEN** the script prints the OWS error output and exits with code 3

---

### Requirement: Chain-restricted policy creation
The installer SHALL create an OWS policy that restricts the agent API key to
Base chain only (eip155:8453) and Base Sepolia testnet (eip155:84532). The policy
SHALL have no expiry. The policy JSON SHALL be written to a temp file and
registered via `ows policy create --file`.

The chain list SHALL be defined as a constant in `lib/functions.sh` so it can be
easily modified for future chain additions.

Reference: OWS policy engine (submodules/open-wallet-standard/docs/03-policy-engine.md)

#### Scenario: Policy created successfully
- **WHEN** the script generates the policy JSON with `allowed_chains: ["eip155:8453", "eip155:84532"]` and no `expires_at`
- **THEN** `ows policy create --file /tmp/agent-chain-policy.json` succeeds
- **AND** the temp file is deleted after registration

#### Scenario: Policy with same ID already exists
- **WHEN** a policy with ID `agent-chain-only` already exists
- **THEN** the script prints "Policy 'agent-chain-only' already exists, reusing" and continues

---

### Requirement: Agent API key creation
The installer SHALL create an OWS API key scoped to the agent wallet and the
chain policy. The API key token (`ows_key_...`) SHALL be captured from stdout
and stored in a file at `~/.ows/<wallet-name>.key` with 0600 permissions.

Reference: OWS agent access layer (submodules/open-wallet-standard/docs/04-agent-access-layer.md)

Trust boundary: The API key token grants agent-level access (policy-restricted).
It cannot bypass OWS policies. The file is only readable by the user (0600).

#### Scenario: API key created successfully
- **WHEN** `ows key create --name "agent-key" --wallet "<name>" --policy "agent-chain-only"` succeeds
- **THEN** the script captures the `ows_key_...` token from output
- **AND** writes it to `~/.ows/<wallet-name>.key` with permissions 0600

#### Scenario: API key creation fails
- **WHEN** the key create command returns non-zero
- **THEN** the script prints the error, suggests running `ows key create` manually, and exits with code 4

---

### Requirement: Agent runtime detection
The installer SHALL detect which agent runtimes are installed by checking for
CLI binaries in PATH and config directories.

Detection logic:
- **OpenCode**: `command -v opencode` OR existence of `~/.opencode/`
- **Claude Code**: `command -v claude` OR existence of `~/.claude/`
- **OpenAI Codex**: `command -v codex` OR existence of `~/.codex/`

#### Scenario: Multiple agents detected
- **WHEN** both `opencode` and `codex` are found
- **THEN** the script lists detected agents and asks: "Install skill for all? [Y/n]" with option to select individually

#### Scenario: Single agent detected
- **WHEN** only `claude` is found
- **THEN** the script auto-selects and confirms: "Detected Claude Code. Installing skill..."

#### Scenario: No agents detected
- **WHEN** no agent binaries or config directories are found
- **THEN** the script prints a warning: "No supported agents detected. You can install skills manually later." and continues (does not exit)

---

### Requirement: Skill installation
The installer SHALL create a skill directory at the appropriate location for each
selected agent, containing a basic placeholder `SKILL.md`. The skill content is
minimal -- name, description, agent address, wallet name. Detailed signing
instructions will be added in a future update.

Skill paths:
- OpenCode: `~/.opencode/skills/agent-wallet/SKILL.md`
- Claude Code: `~/.claude/skills/agent-wallet/SKILL.md`
- Codex: `~/.agents/skills/agent-wallet/SKILL.md`

#### Scenario: Skill installed for an agent
- **WHEN** user selects an agent for skill installation
- **THEN** the script creates the skill directory and `SKILL.md`
- **AND** the SKILL.md contains valid YAML front matter with `name` and `description`
- **AND** the markdown body includes the agent's EVM address and wallet name

#### Scenario: Skill directory already exists
- **WHEN** the skill directory already exists for an agent
- **THEN** the script asks: "Skill already exists. Overwrite? [Y/n]"

---

### Requirement: Skill content -- basic placeholder
The skill SKILL.md SHALL contain:
- YAML front matter: `name: agent-wallet`, `description: Agent wallet for on-chain AA transactions`, `version: 0.1.0`
- Markdown body: agent EVM address, wallet name, note that full instructions will be added later

The skill SHALL NOT contain any raw API key tokens.

#### Scenario: Skill content is valid
- **WHEN** the skill file is generated
- **THEN** it contains valid YAML front matter
- **AND** it does NOT contain any `ows_key_...` tokens

---

### Requirement: Output agent public address
At the end of first-run installation, the script SHALL print the agent wallet's
public EVM address and wallet name in a clear, copy-friendly format. No URL
generation or browser opening.

#### Scenario: Successful installation completes with address
- **WHEN** all installation steps succeed
- **THEN** the script prints:
  ```
  Agent wallet address: 0x...
  Wallet name: <name>
  ```
- **AND** exits with code 0

---

### Requirement: Management -- view status
The "View status" menu option SHALL display:
- Wallet name and EVM address
- Policy details (ID, allowed chains)
- API key status (key name, created date, attached policies)
- Installed skills (which agents, file paths)
- OWS version

#### Scenario: Status displayed
- **WHEN** user selects "View status" from the menu
- **THEN** all status fields are printed in a readable format

---

### Requirement: Management -- update chain policy
The "Update chain policy" option SHALL allow the user to modify which chains
are permitted. It SHALL:
1. Display current allowed chains
2. Prompt for a new chain list (comma-separated CAIP-2 IDs)
3. Delete the old policy via `ows policy delete --id <id> --confirm`
4. Create a new policy with the updated chain list
5. Recreate the API key to attach the new policy (revoke old, create new, overwrite key file)

#### Scenario: Policy updated successfully
- **WHEN** user enters new chain IDs (e.g., `eip155:8453,eip155:42161`)
- **THEN** the old policy is deleted, new policy created, API key regenerated
- **AND** the key file at `~/.ows/<name>.key` is overwritten with the new token

#### Scenario: User cancels policy update
- **WHEN** user enters empty input or presses Ctrl+C at the chain prompt
- **THEN** no changes are made and the menu re-displays

---

### Requirement: Management -- regenerate API key
The "Regenerate API key" option SHALL revoke the existing API key and create a new
one with the same wallet and policy scope. The key file SHALL be overwritten at the
same path (`~/.ows/<wallet-name>.key`) so skill files do not need updating.

#### Scenario: Key regenerated successfully
- **WHEN** user confirms key regeneration
- **THEN** the old key is revoked via `ows key revoke --id <id> --confirm`
- **AND** a new key is created and written to the same file path with 0600 permissions

---

### Requirement: Management -- reinstall skills
The "Reinstall skills" option SHALL re-detect agents and re-install skill files.
This is useful after agent runtime changes or after a skill template update in
a newer version of the installer.

#### Scenario: Skills reinstalled
- **WHEN** user selects "Reinstall skills"
- **THEN** agent detection runs fresh, skill files are overwritten for selected agents

---

### Requirement: Management -- fresh reinstall
The "Reinstall everything" option SHALL perform a full uninstall followed by a
fresh first-run installation. It SHALL require confirmation:
"This will delete your agent wallet, keys, and skills. Continue? [y/N]"

#### Scenario: Fresh reinstall confirmed
- **WHEN** user confirms with `y`
- **THEN** full uninstall runs, then the first-run TUI flow starts

#### Scenario: Fresh reinstall cancelled
- **WHEN** user enters `N` or presses Enter
- **THEN** no changes are made and the menu re-displays

---

### Requirement: Management -- full uninstall
The "Uninstall" option SHALL remove all artifacts created by the installer:
1. Revoke the API key via `ows key revoke`
2. Delete the key file (`~/.ows/<wallet-name>.key`)
3. Delete the policy via `ows policy delete`
4. Delete the wallet via `ows wallet delete --confirm`
5. Remove skill directories for all agents
6. Print confirmation of what was removed

It SHALL require confirmation: "This will permanently delete your agent wallet, keys, policies, and skills. Type 'UNINSTALL' to confirm:"

#### Scenario: Full uninstall confirmed
- **WHEN** user types `UNINSTALL`
- **THEN** all artifacts are removed in reverse order and confirmation is printed

#### Scenario: Uninstall cancelled
- **WHEN** user types anything other than `UNINSTALL`
- **THEN** no changes are made and the menu re-displays

---

### Requirement: Installation state detection
The installer SHALL detect its own installation state by checking:
1. Existence of `~/.ows/agent-wallet.key` (or `~/.ows/<configured-name>.key`)
2. Wallet existence via `ows wallet list`
This determines whether to show first-run TUI or management menu.

A state file at `~/.ows/agent-installer.json` SHALL store metadata:
- `wallet_name`: the wallet name used
- `policy_id`: the policy ID
- `key_name`: the API key name
- `installed_agents`: list of agent types with skill paths
- `installed_at`: ISO-8601 timestamp
- `version`: installer version

#### Scenario: Clean machine
- **WHEN** no state file exists and no matching wallet is found
- **THEN** installer shows first-run TUI

#### Scenario: Existing installation
- **WHEN** state file exists at `~/.ows/agent-installer.json`
- **THEN** installer loads metadata and shows management menu

#### Scenario: Partial installation (state file but wallet missing)
- **WHEN** state file exists but wallet is missing from OWS
- **THEN** installer offers: "Previous installation detected but wallet is missing. Reinstall? [Y/n]"

---

### Requirement: Idempotent execution
The installer SHALL be safe to run multiple times. The state detection and
management menu ensure re-runs do not create duplicate wallets, policies, or keys.

#### Scenario: Re-run with existing installation
- **WHEN** the script is run a second time with complete installation state
- **THEN** the management menu displays, no artifacts are duplicated

---

### Requirement: Clean error handling
Every OWS CLI invocation SHALL have its exit code checked. On failure, the script
SHALL print a contextual error message including the failing command and OWS stderr,
then exit with a specific exit code. The script SHALL use `set -euo pipefail`.

Exit codes:
- 1: platform not supported
- 2: OWS installation failed
- 3: wallet creation failed
- 4: API key creation failed
- 5: general/unexpected error

#### Scenario: Unexpected OWS error mid-flow
- **WHEN** any `ows` command returns non-zero
- **THEN** the script prints "Error at step N: <command> failed" with stderr and exits

---

### Requirement: Configuration via environment variables
The installer SHALL support env vars for non-interactive/CI use:
- `AGENT_WALLET_NAME`: wallet name (default: `agent-wallet`)
- `AGENT_NON_INTERACTIVE`: if set to `1`, skip all prompts and use defaults

#### Scenario: Non-interactive mode
- **WHEN** `AGENT_NON_INTERACTIVE=1` is set
- **THEN** the script uses all defaults without prompting and runs the first-run flow
