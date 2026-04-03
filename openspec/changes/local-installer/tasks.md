## 1. Scaffold directory structure

- [ ] 1.1 Create `installer/` directory with subdirs: `lib/`, `tests/`, `tests/mocks/`
- [ ] 1.2 Create empty files: `install.sh`, `lib/functions.sh`, `lib/ui.sh`, `lib/state.sh`, `lib/skill-template.md`, `lib/policy-template.json`
- [ ] 1.3 Create empty test files: `tests/run-tests.sh`, `tests/helpers.sh`, `tests/test_platform.sh`, `tests/test_ows.sh`, `tests/test_agents.sh`, `tests/test_state.sh`, `tests/test_management.sh`, `tests/test_integration.sh`, `tests/test_idempotent.sh`, `tests/test_skill_content.sh`
- [ ] 1.4 Make `install.sh`, `tests/run-tests.sh`, and all `tests/test_*.sh` executable

**Verify**: `find installer -type f | sort` shows all expected files.

## 2. Implement templates

- [ ] 2.1 Write `lib/policy-template.json` -- `allowed_chains` with `{{CHAIN_IDS}}` placeholder, `id: {{POLICY_ID}}`, no `expires_at`, `action: "deny"`
- [ ] 2.2 Write `lib/skill-template.md` -- basic placeholder SKILL.md with YAML front matter (`name: {{WALLET_NAME}}`, `description`, `version: 0.1.0`) and minimal markdown body (agent address `{{AGENT_ADDRESS}}`, wallet name, note that full instructions TBD)

**Verify**: Templates are valid after manual placeholder substitution.

## 3. Implement TUI helpers (`lib/ui.sh`)

- [ ] 3.1 Write `print_step` -- prints `[N/M] <label>...` with optional status symbol (checkmark/X)
- [ ] 3.2 Write `print_success`, `print_error`, `print_warning` -- colored output helpers
- [ ] 3.3 Write `print_menu` -- displays the management menu with numbered options
- [ ] 3.4 Write `prompt` -- read user input with a default value, e.g., `prompt "Wallet name" "agent-wallet"` returns input or default
- [ ] 3.5 Write `prompt_confirm` -- Y/n confirmation prompt, returns 0 for yes, 1 for no
- [ ] 3.6 Write `prompt_select` -- multi-choice selection (for agent list), returns selected items

**Verify**: Source `lib/ui.sh`, manually call each function, confirm output formatting.

## 4. Implement state management (`lib/state.sh`)

- [ ] 4.1 Write `write_state` -- accepts wallet_name, agent_address, policy_id, key_name, allowed_chains, installed_agents array; writes JSON to `~/.ows/agent-installer.json`
- [ ] 4.2 Write `read_state` -- reads and validates the state file; returns 0 if valid, 1 if missing/invalid
- [ ] 4.3 Write `get_state_field <field>` -- extracts a single field using `python3 -c` JSON parsing
- [ ] 4.4 Write `detect_installation` -- checks state file + wallet existence, returns `none`, `complete`, or `partial`
- [ ] 4.5 Write `clear_state` -- removes the state file

**Verify**: Source `lib/state.sh`, call `write_state` then `read_state`, confirm roundtrip.

## 5. Implement core functions (`lib/functions.sh`)

- [ ] 5.1 Write `detect_platform` -- check `uname -s`, exit 1 if not Darwin
- [ ] 5.2 Write `check_ows_installed` -- check `command -v ows`, return 0/1
- [ ] 5.3 Write `install_ows` -- run OWS official installer, verify `ows --version`
- [ ] 5.4 Write `create_wallet` -- prompt for name (default `agent-wallet`), call `ows wallet create`, parse EVM address, handle existing wallet
- [ ] 5.5 Write `create_policy` -- substitute `DEFAULT_ALLOWED_CHAINS` into template, call `ows policy create --file`, clean up temp file, handle existing policy
- [ ] 5.6 Write `create_api_key` -- call `ows key create`, capture `ows_key_...` token, write to `~/.ows/<name>.key` with `chmod 600`
- [ ] 5.7 Write `detect_agents` -- check for `opencode`/`claude`/`codex` in PATH and config dirs, return list
- [ ] 5.8 Write `install_skill` -- resolve target dir per agent type, `mkdir -p`, `sed` template substitution, write SKILL.md, validate no unresolved `{{` placeholders
- [ ] 5.9 Write management functions: `show_status`, `update_policy`, `regenerate_key`, `reinstall_skills`, `fresh_reinstall`, `full_uninstall`
- [ ] 5.10 Define constants at top: `DEFAULT_ALLOWED_CHAINS`, `POLICY_ID`, `KEY_NAME`, agent skill paths

**Verify**: Source `lib/functions.sh` in a bash session, call each function with test args.

## 6. Implement main script (`install.sh`)

- [ ] 6.1 Write script header: `#!/usr/bin/env bash`, `set -euo pipefail`, resolve script dir, source all three lib files
- [ ] 6.2 Write argument parsing: `--wallet-name`, env var overrides (`AGENT_WALLET_NAME`, `AGENT_NON_INTERACTIVE`)
- [ ] 6.3 Write dispatch logic: `detect_platform` -> `detect_installation` -> branch to first-run or management menu
- [ ] 6.4 Write first-run flow: 6 sequential steps with `print_step` progress, write state file at end, print agent address
- [ ] 6.5 Write management menu loop: `print_menu`, read selection, dispatch to handler function, loop until quit
- [ ] 6.6 Add error handling: step-numbered error messages, exit codes per spec (1-5)

**Verify**: `bash -n installer/install.sh` (syntax check). `shellcheck installer/install.sh` if available.

## 7. Implement test mocks

- [ ] 7.1 Write `tests/mocks/ows` -- record args to `$MOCK_OWS_LOG`, dispatch on command pattern, deterministic output, `MOCK_OWS_FAIL` support, `MOCK_OWS_WALLETS`/`MOCK_OWS_KEYS` for list commands
- [ ] 7.2 Write `tests/mocks/uname` -- return `$MOCK_UNAME_OUTPUT` (default `Darwin`)
- [ ] 7.3 Make both mock scripts executable

**Verify**: `./installer/tests/mocks/ows wallet create --name test` returns deterministic output. `MOCK_OWS_FAIL="wallet create" ./installer/tests/mocks/ows wallet create --name test` exits 1.

## 8. Implement test helpers (`tests/helpers.sh`)

- [ ] 8.1 Write `setup_sandbox` -- `mktemp -d`, export `HOME`, `MOCK_OWS_LOG`, prepend mocks dir to `PATH`, set `AGENT_NON_INTERACTIVE=1`
- [ ] 8.2 Write `teardown_sandbox` -- `rm -rf` temp dir via `trap EXIT`
- [ ] 8.3 Write agent mock helpers: `mock_opencode`, `mock_claude`, `mock_codex`, `mock_no_agents`
- [ ] 8.4 Write assertion functions: `assert_file_exists`, `assert_file_contains`, `assert_file_not_contains`, `assert_file_perms`, `assert_exit_code`, `assert_line_in_log`, `assert_json_field`
- [ ] 8.5 Write test result tracking: global `PASS_COUNT`, `FAIL_COUNT`, `test_summary` function
- [ ] 8.6 Write `setup_existing_install` -- pre-populate sandbox with state file, key file, skill dirs to simulate existing installation for management tests

**Verify**: Source `tests/helpers.sh`, call `setup_sandbox`, confirm `$HOME` is a temp dir.

## 9. Implement unit tests

- [ ] 9.1 Write `tests/test_platform.sh` -- `detect_platform` with Darwin (pass) and Linux (fail)
- [ ] 9.2 Write `tests/test_ows.sh` -- `check_ows_installed`, `create_wallet` (extract address), `create_policy` (valid JSON, correct chains, no expiry), `create_api_key` (token capture, file perms)
- [ ] 9.3 Write `tests/test_agents.sh` -- `detect_agents` (all combos), `install_skill` per agent type (file exists, YAML valid, no key leak)
- [ ] 9.4 Write `tests/test_state.sh` -- `write_state`/`read_state` roundtrip, `get_state_field`, `detect_installation` (none/complete/partial), `clear_state`
- [ ] 9.5 Write `tests/test_skill_content.sh` -- YAML parseable, `name` field correct, `version` present, no `ows_key_` tokens, contains agent address

**Verify**: Run each test file individually, all print pass/fail summary.

## 10. Implement management tests

- [ ] 10.1 Write `tests/test_management.sh` -- test each menu operation:
  - `show_status`: outputs wallet name, address, policy, key, agents
  - `update_policy`: old policy deleted + new created + key regenerated (check mock log)
  - `regenerate_key`: old key revoked + new created + file overwritten with 0600
  - `reinstall_skills`: skill files recreated
  - `fresh_reinstall`: full uninstall then first-run (check mock log sequence)
  - `full_uninstall`: all artifacts gone, state file deleted (check mock log)

**Verify**: `bash tests/test_management.sh` passes all assertions.

## 11. Implement integration tests

- [ ] 11.1 Write `tests/test_integration.sh` -- full first-run happy path: all 3 agents mocked, non-interactive, verify: wallet created, policy registered, key file 0600, 3 skill files, state file valid, output has address, mock log sequence correct
- [ ] 11.2 Add error path tests: OWS install fail (exit 2), wallet fail (exit 3), key fail (exit 4), platform reject (exit 1)
- [ ] 11.3 Write `tests/test_idempotent.sh` -- run installer twice, verify second run enters management menu, no duplicate `wallet create` in mock log

**Verify**: Each integration test file passes.

## 12. Implement test runner

- [ ] 12.1 Write `tests/run-tests.sh` -- discover `test_*.sh`, execute each, collect pass/fail, print summary, exit non-zero on failures

**Verify**: `./installer/tests/run-tests.sh` runs all tests and reports aggregate results.

## 13. Final validation

- [ ] 13.1 Run `shellcheck installer/install.sh installer/lib/*.sh` and fix warnings
- [ ] 13.2 Run full test suite via `./installer/tests/run-tests.sh` -- confirm 100% pass
- [ ] 13.3 Manual smoke test with real OWS: run `./installer/install.sh`, walk through first-run, confirm wallet created and address printed, re-run and confirm management menu appears
