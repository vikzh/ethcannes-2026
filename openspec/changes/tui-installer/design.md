## Context

The installer (`installer/install.sh`) uses a basic TUI built in `installer/lib/ui.sh`.
Every step prints two lines — one at start, one at end — with text-only statuses.
No spinners, no in-place updates, no structured output. The goal is to bring it
to the level of modern CLI installers (OpenCode, Bun) while keeping it pure bash
with no external dependencies.

## Goals / Non-Goals

**Goals:**
- In-place line updates for steps (overwrite, don't duplicate)
- Animated braille spinner for blocking operations
- Unicode status symbols (checkmark, cross, skip)
- Branded header with box-drawing characters
- Per-step elapsed time and total install time
- Expanded color palette (dim, cyan)
- Captured sub-process output (shown only on failure)
- Structured completion summary box
- Graceful degradation for NO_COLOR / non-TTY

**Non-Goals:**
- Download progress bars (OWS installs via `curl | bash` — we don't control its output)
- Dot-leader alignment (adds complexity for marginal visual gain)
- Terminal width detection (fixed-width output sufficient for hackathon)
- Changes to installation logic, MCP server, or state management

## Decisions

### 1. Spinner implementation: background subshell with trap cleanup

The spinner runs in a background process writing braille frames to stderr via `\r`.
The caller runs the actual command, then kills the spinner PID. This avoids
subshell variable scoping issues (the command's exit code and stdout are
captured directly by the caller).

**Why not coprocess?** `coproc` has portability issues and complex fd management.
Background process + kill is simpler and works everywhere.

### 2. In-place updates via `\r\033[2K`

`\r` returns cursor to column 0, `\033[2K` clears the entire line. This is
the standard approach used by npm, yarn, and OpenCode's installer. When
`_IS_TTY` is false, fall back to simple `printf` with newlines (no clear line).

### 3. Two-tier function API

**Low-level** (used by `ui.sh` internally):
- `_spinner_start label` — starts spinner, sets `_SPINNER_PID`
- `_spinner_stop` — kills spinner, clears line

**High-level** (used by `install.sh` and `functions.sh`):
- `step_start N label` — prints step with spinner
- `step_done N label [detail]` — stops spinner, prints checkmark + detail + elapsed time
- `step_fail N label [error_msg]` — stops spinner, prints cross + error
- `step_skip N label [reason]` — prints skip symbol
- `run_with_spinner label command [args...]` — convenience wrapper

The step counter `N` is auto-formatted as `[N/TOTAL]` using a global `TOTAL_STEPS`.

### 4. Sub-process output capture

All blocking commands (ows install, npm install, wallet create, etc.) redirect
stdout+stderr to a temp file. On success, the output is discarded. On failure,
it's printed indented and dimmed below the failed step line.

Pattern:
```bash
local _output_file=$(mktemp)
if command arg1 arg2 > "$_output_file" 2>&1; then
  rm -f "$_output_file"
else
  # Print captured output dimmed
  printf "    ${_DIM}%s${_RESET}\n" "$(cat "$_output_file")"
  rm -f "$_output_file"
fi
```

### 5. Header and summary use box-drawing characters

Header:
```
  ╭──────────────────────────────────╮
  │   Agent Wallet Installer         │
  │   macOS · arm64                  │
  ╰──────────────────────────────────╯
```

Completion summary:
```
  ╭──────────────────────────────────────────╮
  │ Installation complete!                   │
  │                                          │
  │ Address:  0x1234...abcd                  │
  │ Wallet:   agent-wallet                   │
  │ Agents:   OpenClaw, Claude Code/Cowork      │
  │                                          │
  │ Save this address for AA contract setup. │
  ╰──────────────────────────────────────────╯
```

When `_IS_TTY` is false, fall back to plain text without box drawing.

### 6. Color palette expansion

Add to existing palette:
- `_DIM=$'\033[2m'` — for secondary text (paths, versions, timing)
- `_CYAN=$'\033[0;36m'` — for highlighted values (addresses, URLs)

All new colors follow the existing `NO_COLOR` / `! -t 1` guard.

### 7. Elapsed time: bash SECONDS variable

Bash's `SECONDS` variable auto-increments. Capture it at step start, diff at
step end. Format as `(Xs)` or `(X.Xs)` dimmed after the step text.

For sub-second resolution on macOS, use `date +%s` (seconds only — no `%N`
on macOS). This gives 1-second granularity which is acceptable.

### 8. Management menu keeps existing visual style

The management menu and self-test output get the new color palette and symbols
but keep their current structure. The spinner and in-place updates only apply
to the first-run flow steps.

## Risks / Trade-offs

- **[Risk] Spinner PID leak on unexpected exit** → Mitigation: `trap` in `step_start` ensures `_spinner_stop` runs on ERR/EXIT. Global `_SPINNER_PID` variable checked in cleanup.
- **[Risk] Tests depend on output format** → Mitigation: Tests check for wallet behavior, not exact output strings. The self-test uses `grep -q` on functional markers (wallet names, key tokens), not on TUI formatting.
- **[Trade-off] macOS date has no nanoseconds** → Accept 1-second granularity. Fast steps show `(<1s)` instead of exact milliseconds.
- **[Trade-off] Non-TTY loses all visual polish** → Acceptable. CI/pipe usage gets plain text with newlines. The polished experience is for interactive terminals only.
