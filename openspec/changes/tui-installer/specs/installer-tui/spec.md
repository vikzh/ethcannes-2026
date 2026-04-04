## ADDED Requirements

### Requirement: Branded header
The installer SHALL display a header showing the installer name in bold and
platform info in dim text. The header SHALL degrade to plain text when stdout
is not a TTY or `NO_COLOR` is set.

#### Scenario: Interactive terminal header
- **WHEN** the installer runs on an interactive TTY without `NO_COLOR`
- **THEN** a bold header is displayed with "Agent Wallet Installer" and dimmed platform info

#### Scenario: Non-TTY header fallback
- **WHEN** the installer output is piped or `NO_COLOR` is set
- **THEN** a plain text header is displayed

---

### Requirement: Animated spinner for blocking operations
The installer SHALL display an animated braille spinner during blocking operations.
The spinner SHALL run in a background process and be cleaned up on completion,
failure, or unexpected exit (via trap).

#### Scenario: Spinner during OWS install
- **WHEN** OWS is being installed (blocking curl + bash)
- **THEN** an animated spinner is shown on the step line until the operation completes

#### Scenario: Spinner cleanup on failure
- **WHEN** a blocking operation fails while the spinner is running
- **THEN** the spinner process is killed and the line is overwritten with a failure symbol

#### Scenario: Spinner cleanup on interrupt
- **WHEN** the user sends SIGINT during a spinning operation
- **THEN** the spinner process is killed before the script exits

---

### Requirement: In-place step line updates
Each installation step SHALL use a single line that is updated in place. The line
SHALL start with a spinner, then be overwritten with a status symbol when done.
When stdout is not a TTY, each status change SHALL print a new line instead.

#### Scenario: Step completes successfully on TTY
- **WHEN** a step finishes successfully on an interactive terminal
- **THEN** the spinner line is replaced with `✓ [N/M] label  detail  (Xs)`

#### Scenario: Step fails on TTY
- **WHEN** a step fails on an interactive terminal
- **THEN** the spinner line is replaced with `✗ [N/M] label` followed by the error

#### Scenario: Step output on non-TTY
- **WHEN** a step runs with stdout piped (not a TTY)
- **THEN** step start and step end are printed as separate lines without ANSI escape sequences

---

### Requirement: Unicode status symbols
Step completion SHALL use Unicode symbols: `✓` (green) for success,
`✗` (red) for failure, `⊘` (yellow) for skipped. On non-TTY, plain text
fallbacks SHALL be used: `OK`, `FAIL`, `SKIP`.

#### Scenario: Successful step symbol
- **WHEN** a step completes successfully
- **THEN** the line starts with a green `✓`

#### Scenario: Failed step symbol
- **WHEN** a step fails
- **THEN** the line starts with a red `✗`

#### Scenario: Skipped step symbol
- **WHEN** a step is skipped
- **THEN** the line starts with a yellow `⊘`

---

### Requirement: Per-step elapsed time
Each step SHALL display its elapsed time formatted as `(Xs)` or `(<1s)` in dim
text. A total elapsed time SHALL be shown in the completion summary.

#### Scenario: Step with measurable duration
- **WHEN** a step takes 3 seconds to complete
- **THEN** `(3s)` is displayed dimmed after the step detail

#### Scenario: Sub-second step
- **WHEN** a step completes in under 1 second
- **THEN** `(<1s)` is displayed dimmed after the step detail

#### Scenario: Total install time
- **WHEN** installation completes
- **THEN** the summary includes the total elapsed time

---

### Requirement: Expanded color palette
The TUI SHALL use `_DIM` for secondary information and `_CYAN` for highlighted
values. All colors SHALL be empty strings when `NO_COLOR` is set or not a TTY.

#### Scenario: Dim text for timing
- **WHEN** elapsed time is displayed on a TTY
- **THEN** it uses dim ANSI formatting

#### Scenario: Cyan for addresses
- **WHEN** a wallet address is displayed in the summary
- **THEN** it uses cyan ANSI formatting

#### Scenario: Colors disabled with NO_COLOR
- **WHEN** `NO_COLOR` environment variable is set
- **THEN** `_DIM` and `_CYAN` are empty strings

---

### Requirement: Captured sub-process output
All blocking sub-process commands SHALL have stdout and stderr captured. On
success the output SHALL be discarded. On failure it SHALL be displayed
indented and dimmed below the failed step line.

#### Scenario: Successful command output suppressed
- **WHEN** `npm install` succeeds during MCP server setup
- **THEN** no npm output is shown to the user

#### Scenario: Failed command output displayed
- **WHEN** `ows wallet create` fails
- **THEN** the captured error output is printed indented and dimmed below the step line

---

### Requirement: Completion summary
On successful installation, the installer SHALL display an aligned summary with:
wallet address (cyan), wallet name, list of configured agents, total elapsed
time (dim), and a next-step instruction (dim).

#### Scenario: Summary after successful install
- **WHEN** all installation steps complete successfully
- **THEN** a summary is displayed with address, wallet name, agents, timing, and next steps

---

### Requirement: Default vs custom install mode
The installer SHALL prompt the user to choose between default and custom install.
Default install uses wallet name `agent-wallet` and registers all detected agents
without further prompts. Custom install prompts for wallet name and agent selection.
Non-interactive mode (`AGENT_NON_INTERACTIVE=1`) SHALL use default mode.

#### Scenario: Default install
- **WHEN** user selects option 1 (or presses Enter)
- **THEN** wallet name is `agent-wallet`, all detected agents are registered, no further prompts

#### Scenario: Custom install
- **WHEN** user selects option 2
- **THEN** user is prompted for wallet name and agent selection

#### Scenario: Non-interactive mode
- **WHEN** `AGENT_NON_INTERACTIVE=1` is set
- **THEN** default mode is used without showing the mode selection prompt

---

### Requirement: Graceful degradation
All visual enhancements SHALL degrade gracefully when `NO_COLOR` is set, stdout
is not a TTY, or the terminal does not support escape sequences. The installer
SHALL remain fully functional in degraded mode.

#### Scenario: NO_COLOR disables all visual features
- **WHEN** `NO_COLOR=1` is set
- **THEN** no ANSI codes are emitted, no spinner animation

#### Scenario: Piped output uses plain text
- **WHEN** installer output is piped to a file
- **THEN** output is clean plain text with newlines instead of in-place updates
