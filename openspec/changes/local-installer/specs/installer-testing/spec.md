## ADDED Requirements

### Requirement: Test harness location and runner
All tests SHALL reside under `installer/tests/`. The test runner SHALL be a
bash script `installer/tests/run-tests.sh` that executes all test files matching
`installer/tests/test_*.sh`. Each test file SHALL be independently executable.
The runner SHALL report pass/fail counts and exit non-zero if any test fails.

#### Scenario: All tests pass
- **WHEN** `./installer/tests/run-tests.sh` is executed and all tests pass
- **THEN** the runner prints "N/N tests passed" and exits with code 0

#### Scenario: Some tests fail
- **WHEN** one or more test files exit non-zero
- **THEN** the runner prints "M/N tests passed, K failed" with the names of failing tests and exits with code 1

---

### Requirement: Sandboxed test environment
Each test SHALL run in an isolated environment. The test harness SHALL:
1. Create a temp directory (`mktemp -d`) and set `HOME` to it
2. Create mock `~/.ows/`, `~/.opencode/`, `~/.claude/`, `~/.agents/` directories as needed
3. Clean up the temp directory on exit (even on failure) via a trap

No test SHALL read from or write to the real `$HOME`.

#### Scenario: Test creates wallet in sandbox
- **WHEN** a test runs the installer with mocked OWS
- **THEN** wallet files appear under `$FAKE_HOME/.ows/` not under the real `$HOME/.ows/`

#### Scenario: Test cleanup on failure
- **WHEN** a test exits non-zero
- **THEN** the trap handler removes the temp directory

---

### Requirement: OWS CLI mock
Tests SHALL include a mock `ows` script at `installer/tests/mocks/ows` that
simulates OWS CLI behavior without real cryptographic operations. The mock SHALL:

1. Accept the same flags as the real `ows` CLI for: `wallet create`, `wallet info`,
   `wallet list`, `wallet delete`, `policy create`, `policy delete`, `policy list`,
   `policy show`, `key create`, `key list`, `key revoke`, `--version`
2. Return deterministic output:
   - `wallet create`: print a fixed wallet ID and EVM address `0xAGENT1234567890abcdef1234567890abcdef1234`
   - `key create`: print a fixed token `ows_key_mock_0000000000000000000000000000000000000000000000000000000000000000`
   - `policy create`: print success
   - `--version`: print `0.2.18`
   - `wallet list`: return list based on `$MOCK_OWS_WALLETS` env var
   - `key list`: return list based on `$MOCK_OWS_KEYS` env var
3. Record all invocations to `$MOCK_OWS_LOG` (one line per call with full args)
4. Support `MOCK_OWS_FAIL` env var: when set to a command (e.g., `wallet create`),
   that command returns exit code 1

#### Scenario: Mock wallet creation
- **WHEN** the mock receives `wallet create --name "agent-wallet"`
- **THEN** it prints the deterministic output and exits 0

#### Scenario: Mock records invocations
- **WHEN** three ows commands are run during a test
- **THEN** `$MOCK_OWS_LOG` contains exactly three lines with full arguments

#### Scenario: Mock simulates failure
- **WHEN** `MOCK_OWS_FAIL="key create"` is set
- **THEN** `ows key create ...` returns exit code 1

#### Scenario: Mock wallet list with existing wallets
- **WHEN** `MOCK_OWS_WALLETS="agent-wallet"` is set
- **THEN** `ows wallet list` includes `agent-wallet` in output

---

### Requirement: Agent directory mocks
Tests SHALL provide helper functions to simulate installed agents:
- `mock_opencode()`: creates `$HOME/.opencode/` and a fake `opencode` binary in PATH
- `mock_claude()`: creates `$HOME/.claude/` and a fake `claude` binary in PATH
- `mock_codex()`: creates `$HOME/.codex/` and a fake `codex` binary in PATH
- `mock_no_agents()`: ensures none of the above exist

#### Scenario: Simulating OpenCode and Codex installed
- **WHEN** `mock_opencode` and `mock_codex` are called
- **THEN** the installer detects exactly two agents

#### Scenario: Simulating no agents installed
- **WHEN** `mock_no_agents` is called
- **THEN** the installer prints the "no agents detected" warning

---

### Requirement: Unit tests for script functions
The installer SHALL be structured with sourced functions (in
`installer/lib/functions.sh`) so they can be tested independently. Unit tests
SHALL cover:

1. **`detect_platform`**: returns 0 on macOS mock, exits 1 on Linux mock
2. **`check_ows_installed`**: returns 0 when mock ows in PATH, 1 when not
3. **`create_wallet`**: calls `ows wallet create` with correct flags, extracts EVM address
4. **`create_policy`**: generates valid policy JSON with correct chain IDs, no expiry
5. **`create_api_key`**: calls `ows key create`, captures token, writes file with 0600
6. **`detect_agents`**: returns correct list based on mock environment
7. **`install_skill`**: creates correct directory and SKILL.md for each agent type
8. **`read_state`** / **`write_state`**: correctly reads/writes `~/.ows/agent-installer.json`

#### Scenario: detect_platform on mocked Darwin
- **WHEN** `uname` is mocked to return `Darwin`
- **THEN** `detect_platform` returns 0

#### Scenario: detect_platform on mocked Linux
- **WHEN** `uname` is mocked to return `Linux`
- **THEN** `detect_platform` returns 1 and prints the error message

#### Scenario: create_wallet extracts EVM address
- **WHEN** `create_wallet "test-wallet"` runs against mock OWS
- **THEN** the function returns `0xAGENT1234567890abcdef1234567890abcdef1234`

#### Scenario: create_policy generates valid JSON
- **WHEN** `create_policy` runs
- **THEN** the generated policy JSON is valid (parseable by `python3 -m json.tool`)
- **AND** contains `"chain_ids": ["eip155:8453", "eip155:84532"]`
- **AND** does NOT contain an `expires_at` field

#### Scenario: detect_agents with mixed environment
- **WHEN** `mock_opencode` and `mock_codex` are set up but not `mock_claude`
- **THEN** `detect_agents` returns `opencode codex`

#### Scenario: install_skill creates valid SKILL.md
- **WHEN** `install_skill opencode "0xAGENT..." "agent-wallet"` runs
- **THEN** `$HOME/.opencode/skills/agent-wallet/SKILL.md` exists
- **AND** the file starts with `---` (YAML front matter)
- **AND** contains `name: agent-wallet`

#### Scenario: write_state and read_state roundtrip
- **WHEN** `write_state` is called with wallet_name, policy_id, key_name, agents list
- **THEN** `read_state` returns the same values
- **AND** `~/.ows/agent-installer.json` is valid JSON

---

### Requirement: Integration test for full first-run happy path
An integration test SHALL run the complete first-run flow end-to-end in a sandbox
with mock OWS and all three agents mocked in non-interactive mode. It SHALL verify:

1. OWS installation check passes (mock in PATH)
2. Wallet is created with correct name
3. Policy is registered (no expiry)
4. API key is created and saved with 0600 permissions
5. Skill files are created for all three agents
6. State file is written at `~/.ows/agent-installer.json`
7. Output contains the agent EVM address
8. Mock OWS log shows the expected command sequence

#### Scenario: Full first-run happy path
- **WHEN** all three agents are mocked and `AGENT_NON_INTERACTIVE=1`
- **THEN** all eight verification checks pass

---

### Requirement: Integration tests for management operations
Integration tests SHALL verify each management menu operation:

1. **View status**: shows wallet name, address, policy, key status, agents
2. **Update policy**: old policy deleted, new created, key regenerated, key file updated
3. **Regenerate key**: old key revoked, new key created, same file path overwritten
4. **Reinstall skills**: skill files are recreated for detected agents
5. **Fresh reinstall**: all artifacts removed then first-run flow executes
6. **Uninstall**: all artifacts removed, state file deleted

#### Scenario: Update policy changes chain list
- **WHEN** the update-policy operation runs with mock input `eip155:8453,eip155:42161`
- **THEN** mock OWS log shows `policy delete`, `policy create` (with new chains), `key revoke`, `key create`

#### Scenario: Regenerate key overwrites same file
- **WHEN** regenerate-key runs
- **THEN** the key file at the same path has different content than before
- **AND** file permissions are still 0600

#### Scenario: Full uninstall removes everything
- **WHEN** uninstall runs with confirmation
- **THEN** wallet key file, state file, and all skill directories are gone
- **AND** mock OWS log shows `key revoke`, `policy delete`, `wallet delete`

---

### Requirement: Integration tests for error paths
Integration tests SHALL verify graceful failure for:

1. **OWS install failure**: mock `curl` to fail, verify exit code 2
2. **Wallet creation failure**: `MOCK_OWS_FAIL="wallet create"`, verify exit code 3
3. **API key creation failure**: `MOCK_OWS_FAIL="key create"`, verify exit code 4
4. **Platform rejection**: mock `uname` to return `Linux`, verify exit code 1

#### Scenario: OWS install failure produces exit code 2
- **WHEN** OWS is not in PATH and the install curl is mocked to fail
- **THEN** the script exits with code 2

#### Scenario: Wallet creation failure produces exit code 3
- **WHEN** `MOCK_OWS_FAIL="wallet create"` is set
- **THEN** the script exits with code 3

#### Scenario: Platform rejection produces exit code 1
- **WHEN** `uname` is mocked to return `Linux`
- **THEN** the script exits with code 1

---

### Requirement: Integration test for idempotent re-run
An integration test SHALL run the installer twice in the same sandbox and verify
the second run enters the management menu rather than re-creating artifacts.

#### Scenario: Second run shows management menu
- **WHEN** the installer runs a second time in the same sandbox
- **THEN** it does not call `ows wallet create` again (check mock log)
- **AND** the state file is unchanged

---

### Requirement: Skill content validation tests
Tests SHALL validate that generated skill files are well-formed:
1. YAML front matter is parseable
2. `name` field matches the wallet name
3. `version` field is present
4. Markdown body does NOT contain any raw API key tokens (`ows_key_`)
5. Markdown body contains the agent's EVM address

#### Scenario: Skill YAML front matter is valid
- **WHEN** the skill file is parsed
- **THEN** parsing succeeds without errors

#### Scenario: Skill does not leak API key
- **WHEN** the skill file is searched for `ows_key_`
- **THEN** zero matches are found

---

### Requirement: API key file permission test
Tests SHALL verify that `~/.ows/<wallet-name>.key` has exactly 0600 permissions.

#### Scenario: Key file has correct permissions
- **WHEN** `stat -f "%Lp" "$HOME/.ows/<name>.key"` is run
- **THEN** the output is `600`

---

### Requirement: State file validation tests
Tests SHALL verify the state file (`~/.ows/agent-installer.json`) is:
1. Valid JSON
2. Contains required fields: `wallet_name`, `policy_id`, `key_name`, `installed_agents`, `installed_at`, `version`
3. `installed_agents` is a list of objects with `type` and `path` fields

#### Scenario: State file is valid after install
- **WHEN** first-run completes
- **THEN** the state file is valid JSON with all required fields

#### Scenario: State file reflects installed agents
- **WHEN** two agents were selected during install
- **THEN** `installed_agents` has exactly two entries
