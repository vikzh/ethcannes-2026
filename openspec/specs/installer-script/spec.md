## ADDED Requirements

### Requirement: Custom MCP server with DeFi capabilities
The installer SHALL include a custom MCP server at `installer/mcp-server/` built
with `@modelcontextprotocol/sdk` and `viem` (Node.js). The server SHALL expose
OWS wallet operations and DeFi protocol interactions as MCP tools that agents
can call without direct `ows` CLI access. All on-chain interactions target
Base (chainId 8453).

The MCP server SHALL include an `instructions` option in the McpServer constructor.
The instructions string SHALL include: wallet name, wallet EVM address (resolved
dynamically at startup), chain info (Base), comprehensive tool catalog, common
token addresses, typical workflow guidance, and stuck-transaction recovery steps.
The address SHALL be read from OWS at server startup.

#### Core wallet tools:
- `sign_message`: Signs a message using the agent's OWS wallet. Accepts `message`
  (string) and `chain` (string, default `base`). Returns the signature hex string.
  Internally calls `ows sign message` with the API key from the key file.
- `get_address`: Returns the agent wallet's EVM address. No parameters.

#### Uniswap V3 tools (`tools/uniswap.js`):
- `uniswap_swap`: Encodes a Uniswap V3 `exactInputSingle` swap transaction.
  Accepts `tokenIn`, `tokenOut`, `amountIn` (human-readable), `fee` (default 3000),
  `slippageBps` (default 50), optional `recipient`. Uses on-chain quoter for
  slippage protection. Returns encoded tx object for `send_transaction`.
- `uniswap_quote`: Gets a price quote without executing. Returns expected output
  amount, gas estimate, and ticks crossed.

#### Aave V3 tools (`tools/aave.js`):
- `aave_supply`: Encodes a supply/deposit transaction.
- `aave_withdraw`: Encodes a withdrawal transaction. Supports `amount: "max"`.
- `aave_borrow`: Encodes a borrow transaction. Default: variable rate (mode 2).
- `aave_repay`: Encodes a repayment transaction. Supports `amount: "max"`.
- `aave_get_user_data`: Reads account health factor, collateral, debt (on-chain).
- `aave_get_reserves`: Lists available Aave V3 reserve markets (on-chain).

#### Token and balance tools (`tools/balance.js`, `tools/token.js`):
- `get_balance`: Checks native ETH and/or ERC-20 token balance (on-chain).
- `get_token_info`: Reads token metadata: name, symbol, decimals, total supply.
- `approve_erc20`: Encodes an ERC-20 approval transaction. Supports unlimited approval.
- `transfer_erc20`: Encodes an ERC-20 transfer transaction.

#### Generic contract tools (`tools/contract.js`):
- `contract_read`: Calls any view/pure function on any contract. Accepts ABI as
  JSON array or human-readable format.
- `contract_encode`: Encodes calldata for any contract function. Returns tx object.

#### Transaction execution tools (`tools/transaction.js`):
- `send_transaction`: Signs and broadcasts an encoded tx via OWS. Supports optional
  nonce and gas overrides for replacing stuck transactions. Waits for receipt.
- `cancel_transaction`: Cancels a stuck tx by self-transfer at the same nonce with
  higher gas.
- `get_pending_nonce`: Checks confirmed vs pending nonce to detect stuck transactions.
- `get_transaction`: Looks up a transaction by hash.

#### Shared infrastructure:
- `lib/constants.js`: Token addresses (WETH, USDC, USDT, DAI, cbETH, wstETH),
  protocol addresses (Uniswap V3 Router, Quoter; Aave V3 Pool), decimal mappings.
- `lib/rpc.js`: Singleton viem `PublicClient` for Base RPC.
- `lib/abi/`: ABI fragments for ERC-20, Uniswap V3 SwapRouter/QuoterV2, Aave V3 Pool.

#### Legacy prompt (deprecated):
- `uniswap-swap`: Kept for backwards compatibility. Marked as `[DEPRECATED]` in
  description. Returns a message directing users to `uniswap_swap` tool instead.
  Uses `z.string().optional()` with manual defaults (not `z.string().default()`)
  to avoid SDK validation hang.

The MCP server runs as a stdio process spawned by the agent runtime. It reads
the API key from `~/.ows/<wallet-name>.key` and uses it as `OWS_PASSPHRASE`
when invoking `ows` subprocess commands. Version: `0.2.0`.

#### Scenario: Agent calls sign_message via MCP
- **WHEN** an agent invokes the `sign_message` MCP tool with `{"message": "hello", "chain": "base"}`
- **THEN** the MCP server reads the API key, calls `ows sign message`, and returns the signature

#### Scenario: Agent encodes a Uniswap swap
- **WHEN** an agent calls `uniswap_swap` with tokenIn (WETH), tokenOut (USDC), amountIn "0.01"
- **THEN** the server encodes `exactInputSingle` calldata, queries on-chain quote for slippage, and returns a tx object targeting the Uniswap V3 Router

#### Scenario: Agent encodes an Aave supply
- **WHEN** an agent calls `aave_supply` with asset (USDC) and amount "100"
- **THEN** the server encodes Aave V3 `supply` calldata and returns a tx object targeting the Aave Pool

#### Scenario: Agent sends a transaction
- **WHEN** an agent calls `send_transaction` with a tx object from a DeFi tool
- **THEN** the server estimates gas, signs via OWS, broadcasts, waits for receipt, and returns hash + status

#### Scenario: MCP server starts with missing key file
- **WHEN** the key file does not exist at the expected path
- **THEN** the MCP server returns an error: "API key file not found"

#### Scenario: MCP server returns instructions during init
- **WHEN** a client sends an `initialize` request
- **THEN** the response includes an `instructions` field with wallet address, full tool catalog, token addresses, workflow guidance, and stuck-tx recovery steps

#### Scenario: Instructions contain dynamic wallet address
- **WHEN** the MCP server starts with `AGENT_WALLET_NAME=agent-wallet`
- **THEN** the instructions include the actual EVM address from OWS (not a placeholder)

---

### Requirement: MCP server registration per agent
The installer SHALL register the MCP server with each detected agent using
the agent's native MCP configuration mechanism. Registration SHALL only register
MCP (no skill file creation). The installer SHALL NOT create or manage SKILL.md
files for any agent.

- **OpenClaw**: `openclaw mcp set agent-wallet '{"command":"node","args":["/path/to/mcp-server/index.js"],"env":{"AGENT_WALLET_NAME":"<name>"}}'`
- **Claude Code/Cowork**: `claude mcp add agent-wallet --transport stdio --scope user -- node /path/to/mcp-server/index.js` (or write to `~/.claude.json` if `claude` CLI not in PATH)
- **Codex**: Append `[mcp_servers.agent-wallet]` section to `~/.codex/config.toml`

#### Scenario: MCP registered for OpenClaw
- **WHEN** OpenClaw is detected and user confirms
- **THEN** `openclaw mcp show agent-wallet` returns the server configuration

#### Scenario: MCP registered for Claude Code/Cowork
- **WHEN** Claude Code/Cowork is detected (via `~/.claude/` directory)
- **THEN** the MCP config is written to `~/.claude.json` or via `claude mcp add`

#### Scenario: MCP registered for Codex
- **WHEN** Codex is detected
- **THEN** `~/.codex/config.toml` contains an `[mcp_servers.agent-wallet]` section

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
dependencies (`@modelcontextprotocol/sdk`, `viem`).

#### Scenario: npm install succeeds
- **WHEN** `npm install` completes in the mcp-server directory
- **THEN** `node_modules/` is created and installation continues

---

### Requirement: Agent detection
Detection determines which agents to register MCP with.

Detection logic:
- **OpenClaw**: `command -v openclaw` OR `~/.openclaw/` exists
- **Claude Code/Cowork**: `command -v claude` OR `~/.claude/` exists
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
[4] Reinstall MCP, [5] Reinstall everything, [6] Uninstall, [q] Quit

#### Scenario: Returning user
- **WHEN** state file and key file exist
- **THEN** management menu displays

---

### Requirement: --reinstall flag
`./install.sh --reinstall` SHALL force full cleanup (including wallet deletion
from OWS, MCP deregistration from agents -- no skill file cleanup needed) and
run fresh install.

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
