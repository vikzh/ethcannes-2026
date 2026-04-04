## Tasks

### ui.sh — new TUI primitives

- [x] Add `_DIM`, `_CYAN`, `_IS_TTY` to color palette with NO_COLOR/TTY guards
- [x] Add `_spinner_start` and `_spinner_stop` functions (background process, braille frames, trap cleanup)
- [x] Add `step_start`, `step_done`, `step_fail`, `step_skip` functions with in-place updates
- [x] Add `run_with_spinner` convenience wrapper (runs command with spinner, captures output, shows on failure)
- [x] Add `print_header` function (clean text, no box borders)
- [x] Add `print_summary_box` function for completion summary (clean aligned output, no box borders)
- [x] Update `print_menu` to use new color palette and branded style
- [x] Keep existing prompt functions (`prompt`, `prompt_confirm`, `prompt_select`, `prompt_menu`) unchanged

### install.sh — use new TUI primitives

- [x] Replace header in `run_first_install` with `print_header`
- [x] Add total timer (`_INSTALL_START` at begin, elapsed at end)
- [x] Replace all `print_step` calls with `step_start`/`step_done`/`step_fail`/`step_skip` pattern
- [x] Replace completion summary with `print_summary_box`
- [x] Update self-test output to use Unicode symbols (`✓`/`✗`) instead of `PASS`/`FAIL` text

### install.sh — default vs custom install mode

- [x] Add install mode selection prompt (default vs custom) after header
- [x] Default mode: uses `agent-wallet` name, registers all detected agents, no interactive prompts
- [x] Custom mode: prompts for wallet name, lets user select agents
- [x] Non-interactive mode (`AGENT_NON_INTERACTIVE=1`) skips mode selection, uses default
- [x] Pass `--use-existing` to `create_wallet` in default mode to avoid blocking prompt

### functions.sh — OWS artifact cleanup

- [x] Add `remove_ows_skills` to clean all 16 agent skill directories
- [x] Add `remove_ows_mcp` to strip any "ows" MCP entries from agent configs (OpenClaw, Claude, Codex, OpenCode)
- [x] Add `clean_ows_agent_artifacts` combining skills + MCP removal
- [x] Call `clean_ows_agent_artifacts` unconditionally after OWS step (pre-existing or fresh install)
- [x] Add `install_ows_quiet` with output capture for TUI spinner
- [x] Add `install_mcp_deps_quiet` with output capture for TUI spinner
- [x] Remove redundant `print_info "Installing OWS..."` from `install_ows`

### functions.sh — full uninstall

- [x] Add `uninstall_ows` function calling `ows uninstall [--purge]` with piped confirmation
- [x] Update `do_uninstall_cleanup` to run `ows uninstall --purge` + `clean_ows_agent_artifacts`
- [x] Add `--keep-ows` flag to `do_uninstall_cleanup` for reinstall scenarios
- [x] Update `--reinstall`, `fresh_reinstall`, and partial-state recovery to use `--keep-ows`
- [x] Add `--use-existing` flag to `create_wallet` for silent reuse of existing wallets

### Naming

- [x] Rename "Claude Coworker" to "Claude Code/Cowork" in all live code and specs

### Smoke test

- [x] Run `./installer/install.sh --self-test` and verify all 19 tests pass
- [x] Run `./installer/tests/run-tests.sh` and verify all 78 unit tests pass
