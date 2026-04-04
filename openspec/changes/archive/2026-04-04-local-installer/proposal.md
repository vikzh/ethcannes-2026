## Why

AI coding agents need a secure local wallet to interact with on-chain Account
Abstraction contracts. Agents run in security sandboxes and cannot call local
binaries (like `ows`) directly. MCP (Model Context Protocol) is the universal
bridge -- all three target agents (OpenClaw, Claude Coworker, Codex) support MCP
servers as the standard way to expose local tools to sandboxed agents.

The installer must: provision an OWS wallet, create a chain-restricted API key,
build and register a custom MCP server that wraps OWS signing, and configure
each agent to connect to it. The MCP server is the only interface the agent uses --
it never calls `ows` directly.

This tool will be actively developed -- the MCP server will grow to support
AA-specific operations, policy management, and transaction building.

## What Changes

- New `installer/` directory containing:
  - Interactive TUI installer (`install.sh`) for wallet, policy, key, MCP server setup
  - Custom MCP server (`mcp-server/`) that wraps OWS signing operations
  - Skill templates that teach agents how to use the MCP tools
  - Full test harness with mocks and self-test
- The installer registers the MCP server with each detected agent:
  - **OpenClaw**: `openclaw mcp set` or `openclaw.json`
  - **Claude Coworker**: `claude mcp add` or `~/.claude.json` / `.mcp.json`
  - **Codex**: `~/.codex/config.toml` `[mcp_servers]` section
- First run: guided TUI walks through OWS install, wallet creation, chain policy,
  API key, MCP server setup, agent MCP registration. Outputs agent public address.
- Subsequent runs: management menu (status, update policy, regenerate key,
  reinstall MCP, fresh reinstall, uninstall)
- The skill file (SKILL.md) teaches the agent about available MCP tools, not
  about calling `ows` directly

## Capabilities

### New Capabilities
- `installer-script`: Interactive TUI bash installer -- OWS provisioning, wallet
  creation, chain policy, API key, MCP server build/registration, agent skill
  installation, lifecycle management. All artifacts under `installer/`.
- `mcp-server`: Custom MCP server (Node.js, `@modelcontextprotocol/sdk`) that
  exposes OWS signing as MCP tools. For now: `sign_message` tool that signs a
  dummy payload via `ows`. Will grow to include transaction signing, AA interactions.
- `installer-testing`: Test strategy and harness -- unit tests, integration tests,
  MCP server tests, self-test with real OWS including signing verification.

### Modified Capabilities
_(none -- no existing specs are changed)_

## Impact

- **New directory**: `installer/` (script, lib, mcp-server, templates, tests, mocks)
- **Depends on**: OWS CLI, Node.js (for MCP server), agent runtimes
- **Agent config changes**: Registers MCP server in each agent's config
- **No contract changes**: This change is purely client-side tooling
