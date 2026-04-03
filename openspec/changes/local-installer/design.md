## Context

Users need a zero-friction way to provision a local agent wallet and connect it to
the on-chain AA system. OWS provides all the primitives (wallet create, policy
create, key create) but they require ~10 manual steps. The installer automates this
into a single command with an interactive TUI, and provides ongoing lifecycle
management (update policies, regenerate keys, reinstall skills, uninstall).

This tool will be actively developed. Skills, SDK utilities, and AA tooling will be
added over time. The architecture must support easy extension of both the first-run
flow and the management menu.

**Stakeholders**: End users (developers running agents), agent runtimes (OpenCode,
Claude Code, Codex), OWS (upstream dependency), frontend (will eventually host the
one-liner).

**Constraints**:
- macOS only (hackathon scope)
- Bash -- no compiled dependencies beyond OWS itself
- Must work offline after OWS is installed (no network calls except OWS install)
- All output files live under `installer/` in the repo or `~/.ows/` and
  `~/.<agent>/skills/` on the user's machine

---

## Goals / Non-Goals

**Goals:**
- One command installs everything: OWS, wallet, policy, API key, agent skills
- Interactive TUI for both first-run and ongoing management
- Idempotent -- safe to re-run, detects existing state
- Fully testable without real OWS binary, real filesystem, or real chain
- Clear trust boundaries: script never touches raw keys or passphrases
- Easy to extend with new menu options, new agent types, new policy fields
- Self-verifying one-liner for supply chain protection

**Non-Goals:**
- Windows or Linux support (hackathon scope)
- Agent skill runtime behavior (skill content is a placeholder; details come later)
- On-chain AA deployment (separate concern)
- Daemon or long-running process
- URL generation or browser opening (deferred to future update)

---

## Decisions

### D1: Directory structure -- `installer/`

```
installer/
  install.sh                 # Entry point (sources lib/, dispatches to flows)
  lib/
    functions.sh             # All reusable functions (testable independently)
    ui.sh                    # TUI helpers (print_step, print_menu, prompt, etc.)
    state.sh                 # State file read/write/detect
    skill-template.md        # Basic placeholder SKILL.md with {{PLACEHOLDERS}}
    policy-template.json     # Policy JSON with {{POLICY_ID}}, {{CHAIN_IDS}}
  tests/
    run-tests.sh             # Test runner
    helpers.sh               # Sandbox, mocks, assertions
    test_platform.sh         # Platform detection
    test_ows.sh              # OWS operations
    test_agents.sh           # Agent detection + skill install
    test_state.sh            # State file operations
    test_management.sh       # Management menu operations
    test_integration.sh      # Full end-to-end flows
    test_idempotent.sh       # Re-run behavior
    test_skill_content.sh    # Skill file validation
    mocks/
      ows                    # Mock OWS binary
      uname                  # Mock uname for platform tests
```

**Rationale**: Splitting functions across `functions.sh`, `ui.sh`, and `state.sh`
keeps each file focused. All three are sourced by `install.sh`. Tests source only
the files they need.

**Alternative considered**: Single `functions.sh`. Would work but grows unwieldy as
management operations are added. Three files at ~100-200 lines each is more
maintainable.

### D2: Two-mode TUI dispatch

`install.sh` main flow:
```
source lib/functions.sh
source lib/ui.sh
source lib/state.sh

detect_platform
state=$(read_state)

if [state is empty or no wallet found]:
    run_first_install_flow
else:
    run_management_menu
```

**First-run flow** -- sequential steps with progress indicator:
```
[1/6] Checking OWS...           ✓ v0.2.18
[2/6] Creating wallet...        Enter name [agent-wallet]: _
                                 ✓ 0xABCD...
[3/6] Setting up chain policy... ✓ Base + Base Sepolia
[4/6] Generating API key...     ✓ saved to ~/.ows/agent-wallet.key
[5/6] Installing agent skills... Detected: OpenCode, Codex
                                 Install for all? [Y/n]: _
                                 ✓ 2 skills installed
[6/6] Done!

Agent wallet address: 0xABCD...1234
Wallet name: agent-wallet
```

**Management menu** -- loop until quit:
```
Agent Wallet Manager
====================
Wallet: agent-wallet (0xABCD...1234)

[1] View status
[2] Update chain policy
[3] Regenerate API key
[4] Reinstall skills
[5] Reinstall everything (fresh)
[6] Uninstall
[q] Quit

Select: _
```

Each menu handler is a function in `functions.sh` that runs its operation and
returns to the loop.

### D3: State file for installation metadata

`~/.ows/agent-installer.json`:
```json
{
  "version": "0.1.0",
  "wallet_name": "agent-wallet",
  "agent_address": "0xABCD...1234",
  "policy_id": "agent-chain-only",
  "key_name": "agent-key",
  "installed_agents": [
    { "type": "opencode", "path": "~/.opencode/skills/agent-wallet/SKILL.md" },
    { "type": "codex", "path": "~/.agents/skills/agent-wallet/SKILL.md" }
  ],
  "allowed_chains": ["eip155:8453", "eip155:84532"],
  "installed_at": "2026-04-03T10:00:00Z"
}
```

**Rationale**: Single JSON file captures all state needed for management operations
and status display. Using JSON (not env file or YAML) because `python3 -c` is
available on macOS for parsing and bash can write it with printf. The state file
also makes it easy for future tools (SDK, frontend) to discover the agent's config.

**Read/write pattern**: `state.sh` provides `read_state`, `write_state`,
`get_state_field <field>`. Read uses `python3 -c "import json,sys; ..."` for
reliable parsing. Write uses heredoc with variable interpolation.

### D4: OWS subprocess invocation pattern (Profile B)

The agent skill invokes OWS signing via subprocess:
```bash
OWS_PASSPHRASE="$(cat ~/.ows/agent-wallet.key)" \
  ows sign tx --wallet "agent-wallet" --chain base --tx "$RAW_TX_HEX"
```

OWS detects `ows_key_` prefix -> agent mode -> policy enforcement -> sign or deny.

Trust boundary: Agent sees the API key token (capability token) but never the
private key. OWS enforces policy before decryption.

Reference: OWS 03-policy-engine.md, 04-agent-access-layer.md.

### D5: Identical skill file across agents

All three agent runtimes use the same SKILL.md format. One template, three
target directories:

| Agent       | Path                                        |
|-------------|---------------------------------------------|
| OpenCode    | `~/.opencode/skills/agent-wallet/SKILL.md`  |
| Claude Code | `~/.claude/skills/agent-wallet/SKILL.md`    |
| Codex       | `~/.agents/skills/agent-wallet/SKILL.md`    |

The placeholder skill has minimal content -- name, description, version, agent
address, wallet name. Detailed signing instructions will be added in a future
update to the template.

### D6: Policy template -- chains as configurable constant

In `lib/functions.sh`:
```bash
DEFAULT_ALLOWED_CHAINS='["eip155:8453", "eip155:84532"]'
```

The `create_policy` function substitutes this into the template. The
`update_policy` management operation prompts for a new chain list and rewrites
this value in the state file + OWS policy. This makes chain configuration a
one-line change for developers and a menu option for users.

No expiry field. The policy only contains `allowed_chains` + `action: "deny"`.

### D7: Key regeneration overwrites same file path

When regenerating an API key:
1. Read state to get `key_name`
2. `ows key revoke --id <key_name> --confirm`
3. `ows key create --name <key_name> --wallet <wallet> --policy <policy>`
4. Capture new token, overwrite `~/.ows/<wallet-name>.key`
5. Update state timestamp

The key file path never changes, so skill files don't need updating.

### D8: Uninstall removes everything

Reverse order of creation:
1. Revoke API key
2. Delete key file
3. Delete policy
4. Delete wallet (via `ows wallet delete --wallet <name> --confirm`)
5. Remove skill directories for each agent in state's `installed_agents`
6. Delete state file (`~/.ows/agent-installer.json`)

Requires typing `UNINSTALL` to confirm (not just Y/n) since wallet deletion
is irreversible.

### D9: Mock-based testing with recorded invocations

The mock `ows` binary is a bash script that:
1. Appends `"$@"` to `$MOCK_OWS_LOG`
2. Pattern-matches `$1 $2` for dispatch
3. Checks `$MOCK_OWS_FAIL` for failure simulation
4. Supports `$MOCK_OWS_WALLETS` and `$MOCK_OWS_KEYS` for list command output

Management tests pre-populate the sandbox with a state file and mock wallet data,
then invoke specific menu operations and verify the mock log sequence.

### D10: Self-verifying one-liner

The recommended install command is:
```bash
curl -fsSL https://<domain>/install.sh -o /tmp/aw-install.sh \
  && echo "<sha256hash>  /tmp/aw-install.sh" | shasum -a 256 -c \
  && bash /tmp/aw-install.sh
```

The hash is displayed on the frontend page and updated whenever `install.sh`
changes. The script itself does not need to know its own hash -- the verification
happens before execution.

---

## Risks / Trade-offs

**[Risk] OWS CLI output format changes** -> Script parses stdout to extract EVM
address and API key token.
Mitigation: Use `--json` flag if available, fall back to line parsing. Pin mock
to known output format.

**[Risk] Agent config directory locations change** -> Skill paths are conventions
not contracts.
Mitigation: Paths defined as constants in `functions.sh`, easy single-point update.
State file records actual paths used.

**[Risk] Passphrase UX friction** -> User must enter passphrase during wallet
creation (OWS interactive prompt).
Mitigation: Document that the prompt is expected. For CI, document `OWS_PASSPHRASE`
env var.

**[Risk] State file corruption** -> If JSON is hand-edited or partially written.
Mitigation: `read_state` validates JSON before using it. On parse failure, treat
as partial install and offer recovery.

**[Risk] Template placeholder left unreplaced** -> `sed` substitution fails silently.
Mitigation: Post-generation grep for `{{` in output (none expected in placeholder
skill since `{{AA_CONTRACT_ADDRESS}}` is no longer used).

**[Trade-off] No Windows/Linux** -> Limits adoption. Acceptable for hackathon.

**[Trade-off] Bash over TypeScript** -> Less type safety but zero dependencies.
Test harness validates correctness.

**[Trade-off] python3 dependency for JSON parsing** -> macOS ships with python3
since Monterey. Acceptable.

---

## Open Questions

1. **Future SDK/util installation**: The tool will grow to install additional
   utilities (AA SDK, etc.). Should we reserve a management menu slot now
   (e.g., "[7] Install extensions") or add it when the first extension is ready?

2. **Skill update versioning**: When the skill template changes in a newer
   installer version, should "Reinstall skills" auto-detect that the installed
   version is older and prompt to update? Requires comparing `version` in state
   file vs current installer version.
