# Agent Wallet Installer

Interactive CLI installer for setting up an OWS (Open Wallet Standard) agent wallet with DeFi capabilities on Base. Creates a wallet, configures chain-restricted policies, generates API keys, and registers an MCP server with your AI coding agents.

## Quick Start

```bash
./installer/install.sh
```

Choose **Default install** (option 1) to get going immediately with sensible defaults:
- Wallet name: `agent-wallet`
- All detected agents registered automatically
- Chain policy: Base + Base Sepolia

Choose **Custom install** (option 2) to pick a wallet name and select which agents to register.

## Prerequisites

- **macOS** (Darwin only)
- **Node.js** (for the MCP server)
- **OWS** (installed automatically if missing)

## What It Does

The installer runs an 8-step flow:

1. **Platform check** -- verifies macOS
2. **OWS** -- checks for or installs OWS, cleans up OWS-installed skill files
3. **Node.js** -- verifies Node.js is available
4. **Wallet** -- creates an EVM wallet with empty passphrase (security via on-chain AA policies)
5. **Chain policy** -- restricts signing to Base + Base Sepolia
6. **API key** -- generates key, saves to `~/.ows/<wallet>.key` (0600 perms)
7. **MCP server** -- runs `npm install` for dependencies
8. **Agent registration** -- registers the MCP server with detected agents

## MCP Server

The MCP server at `installer/mcp-server/` exposes 20 tools across 6 categories:

| Category | Tools |
|----------|-------|
| Wallet | `sign_message`, `get_address` |
| Uniswap V3 | `uniswap_swap`, `uniswap_quote` |
| Aave V3 | `aave_supply`, `aave_withdraw`, `aave_borrow`, `aave_repay`, `aave_get_user_data`, `aave_get_reserves` |
| Tokens | `get_balance`, `get_token_info`, `approve_erc20`, `transfer_erc20` |
| Contract | `contract_read`, `contract_encode` |
| Transaction | `send_transaction`, `cancel_transaction`, `get_pending_nonce`, `get_transaction` |

The server auto-delivers `instructions` at connection time with the full tool catalog, token addresses, workflow guidance, and stuck-transaction recovery steps.

### Typical Agent Workflow

```
1. get_balance          -- check what you have
2. approve_erc20        -- approve token for protocol
3. uniswap_swap         -- encode a swap (or aave_supply, contract_encode, etc.)
4. send_transaction     -- sign + broadcast via OWS
5. get_transaction      -- verify on-chain
```

## Supported Agents

| Agent | Detection | Config Method |
|-------|-----------|---------------|
| OpenClaw | `openclaw` binary or `~/.openclaw/` | JSON (`mcp.servers` key path) |
| Claude Code/Cowork | `claude` binary or `~/.claude/` | CLI or `~/.claude.json` |
| Codex | `codex` binary or `~/.codex/` | TOML (`~/.codex/config.toml`) |

## Management Menu

Re-run the installer after initial setup to access the management menu:

```
[1] View status
[2] Update chain policy
[3] Regenerate API key
[4] Reinstall MCP
[5] Reinstall everything
[6] Uninstall
[q] Quit
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--wallet-name <name>` | Override wallet name (default: `agent-wallet`) |
| `--reinstall` | Full cleanup + fresh install (preserves OWS binary) |
| `--self-test` | Automated end-to-end test with real OWS in sandboxed HOME |
| `--help` | Show usage |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_WALLET_NAME` | Wallet name (default: `agent-wallet`) |
| `AGENT_NON_INTERACTIVE` | Set to `1` for non-interactive mode (uses all defaults) |
| `BASE_RPC_URL` | Override Base RPC endpoint (default: `https://mainnet.base.org`) |

## Tests

```bash
# Shell unit tests (78 tests, sandboxed)
bash installer/tests/run-tests.sh

# MCP integration tests (78 tests, requires real OWS wallet)
node installer/mcp-server/test-client.js

# End-to-end self-test (19 tests, real OWS in sandboxed HOME)
./installer/install.sh --self-test
```

## File Structure

```
installer/
  install.sh              -- main entry point (TUI, install flow, management menu, self-test)
  lib/
    ui.sh                 -- TUI primitives (spinners, colors, symbols, timing)
    functions.sh          -- core logic (wallet, policy, key, agents, MCP, OWS cleanup)
    state.sh              -- state file management (~/.ows/agent-installer.json)
    policy-template.json  -- chain restriction policy template
  mcp-server/
    index.js              -- MCP server entry point
    package.json          -- dependencies (@modelcontextprotocol/sdk, viem)
    tools/
      uniswap.js          -- Uniswap V3 swap + quote
      aave.js             -- Aave V3 supply/withdraw/borrow/repay/data/reserves
      balance.js          -- ETH + ERC-20 balance, token info
      token.js            -- ERC-20 approve + transfer
      contract.js         -- generic contract read + encode
      transaction.js      -- send, cancel, nonce check, tx lookup
    lib/
      constants.js        -- token addresses, protocol addresses, decimals
      rpc.js              -- viem PublicClient singleton
      abi/                -- ABI fragments (ERC-20, Uniswap V3, Aave V3)
    test-client.js        -- MCP Client SDK integration tests
  tests/
    run-tests.sh          -- test runner
    helpers.sh            -- sandbox, mocks, assertions
    test_*.sh             -- test suites
    mocks/                -- mock OWS binary and uname
```
