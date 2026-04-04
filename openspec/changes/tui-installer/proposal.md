## Why

The current installer TUI is functional but visually crude — plain text headers with `====` underlines, no spinners or in-place progress, text-only status words (`done`/`FAILED`/`skipped`), no timing, and duplicate output lines per step. Modern CLI tools (OpenCode, Bun, Deno) set a higher bar with animated spinners, Unicode checkmarks, branded banners, progress bars, dimmed secondary text, and structured completion summaries. For a hackathon demo where first impressions matter, the install experience needs to feel polished and intentional.

## What Changes

- Replace `print_step` two-line pattern with in-place line updates using `\r` + `\033[2K` (carriage return + clear line)
- Add animated braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) for blocking operations (OWS install, npm install, wallet creation)
- Replace text statuses with Unicode symbols: `✓` (success), `✗` (failure), `⊘` (skipped)
- Add branded header box using box-drawing characters (╭╮╰╯│), showing installer version and platform
- Add elapsed time per step and total install time
- Expand color palette: add dim (`\033[2m`) for secondary info (paths, versions, timing), cyan for highlighted values (addresses, URLs)
- Suppress all sub-process stdout/stderr during normal operation; capture and display only on failure (dimmed, indented)
- Add structured completion summary box with wallet address, configured agents, and next-step guidance
- Add dot-leader alignment for status display (e.g., `✓ OWS .............. v0.3.1`)
- Refactor `ui.sh` into clean primitives: `spinner_start`, `spinner_stop`, `step_start`, `step_done`, `step_fail`, `print_box`, `print_summary`
- Add download-style progress bar for OWS installation (inspired by OpenCode's `■` / `･` progress bar)
- Graceful error presentation: failed step shown clearly with captured error output indented and dimmed, plus suggested fix
- Ensure all visual features degrade gracefully when `NO_COLOR` is set or stdout is not a terminal (fall back to plain text, no spinners)

## Capabilities

### New Capabilities
- `installer-tui`: Visual TUI primitives for the installer — spinners, in-place updates, box drawing, progress bars, color palette, timing, and degraded-mode fallbacks. Covers all UI/UX patterns used by `install.sh` and its management menu.

### Modified Capabilities
- `installer-script`: The installation flow steps and management menu requirements are unchanged, but the UI presentation layer for each step changes (in-place updates, spinners, structured output). The spec gains requirements for spinner behavior, progress display, and completion summary format.

## Impact

- `installer/lib/ui.sh` — major rewrite (new primitives, spinner subprocess management, box drawing)
- `installer/install.sh` — update all `print_step` call sites to use new primitives
- `installer/lib/functions.sh` — wrap blocking operations with spinner/progress helpers, capture sub-process output
- `installer/tests/` — test helpers may need updates for new output format (status symbols instead of text)
- No dependency changes (pure bash, no external tools beyond standard ANSI terminal support)
- No changes to MCP server, state management, or installation logic
