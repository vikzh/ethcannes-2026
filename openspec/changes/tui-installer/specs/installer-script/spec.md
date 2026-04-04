## MODIFIED Requirements

### Requirement: Single entry point
The installer SHALL be a single bash script at `installer/install.sh` that
supports both initial installation and ongoing management via an interactive TUI.
The first-run flow SHALL present a default vs custom install choice, use in-place
line updates with animated spinners, and Unicode status symbols.

#### Scenario: User runs the installer
- **WHEN** user runs `./installer/install.sh`
- **THEN** the script displays a branded header and install mode selection

---

### Requirement: Interactive TUI -- management menu
When existing installation detected, show menu with branded header:
[1] View status, [2] Update chain policy, [3] Regenerate API key,
[4] Reinstall MCP, [5] Reinstall everything, [6] Uninstall, [q] Quit.

#### Scenario: Returning user
- **WHEN** state file and key file exist
- **THEN** management menu displays with branded header

---

### Requirement: Output agent public address
At the end of first-run, display an aligned summary with the agent wallet's
EVM address (cyan), wallet name, configured agents, total elapsed time, and a
next-step instruction.

#### Scenario: Successful install
- **WHEN** all steps complete
- **THEN** summary is displayed with address, agents, and timing

---

### Requirement: Agent wallet creation with empty passphrase
The installer SHALL create the wallet with an empty passphrase for seamless
agent signing. In default install mode, `create_wallet` SHALL silently reuse
an existing wallet of the same name via the `--use-existing` flag. In custom
mode, the user SHALL be prompted to confirm reuse.

#### Scenario: Default mode reuses existing wallet
- **WHEN** wallet `agent-wallet` already exists and default mode is selected
- **THEN** the existing wallet is reused without prompting

#### Scenario: Custom mode prompts for existing wallet
- **WHEN** wallet already exists and custom mode is selected
- **THEN** user is asked whether to reuse the existing wallet

## ADDED Requirements

### Requirement: OWS agent artifact cleanup
The installer SHALL remove OWS-installed skill files and MCP entries from all
known agent config directories after OWS installation or detection. This applies
unconditionally whether OWS was pre-existing or freshly installed. The installer
uses its own MCP server, not OWS's skill files.

Skill directories cleaned (16 agent locations):
`~/.agents/skills/ows`, `~/.claude/skills/ows`, `~/.config/agents/skills/ows`,
`~/.cursor/skills/ows`, `~/.copilot/skills/ows`, `~/.codex/skills/ows`,
`~/.gemini/skills/ows`, `~/.config/opencode/skills/ows`, `~/.config/goose/skills/ows`,
`~/.windsurf/skills/ows`, `~/.codeium/windsurf/skills/ows`, `~/.continue/skills/ows`,
`~/.roo/skills/ows`, `~/.kiro/skills/ows`, `~/.augment/skills/ows`, `~/.trae/skills/ows`

MCP entries cleaned: `ows` key removed from OpenClaw, Claude Code/Cowork,
Claude Desktop, Codex, and OpenCode config files.

#### Scenario: Pre-existing OWS has skills installed
- **WHEN** OWS was already installed and has skill files in agent directories
- **THEN** all OWS skill directories are removed before agent registration

#### Scenario: Fresh OWS install creates skills
- **WHEN** OWS is freshly installed by the installer
- **THEN** OWS-created skill files are removed immediately after install

---

### Requirement: Full OWS uninstall on uninstall
The installer's uninstall (`[6] Uninstall`) SHALL run `ows uninstall --purge`
to remove the OWS binary, vault data, PATH entries, and language bindings.
The reinstall paths (`--reinstall`, `[5] Reinstall everything`) SHALL use
`--keep-ows` to preserve OWS for the subsequent fresh install.

#### Scenario: Full uninstall removes OWS
- **WHEN** user confirms full uninstall
- **THEN** `ows uninstall --purge` runs, removing binary, vault, and bindings

#### Scenario: Reinstall keeps OWS
- **WHEN** user selects reinstall
- **THEN** wallet/policy/key/MCP are cleaned but OWS binary remains
