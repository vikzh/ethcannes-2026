## Context

Agents (OpenClaw, Claude Coworker, Codex) run in security sandboxes and cannot call
local binaries directly. MCP is the universal bridge -- all three support MCP servers
as the way to expose local tools. The installer provisions an OWS wallet, builds a
custom MCP server that wraps OWS signing, and registers it with each agent.

**Key insight**: The agent never calls `ows` directly. It calls MCP tools like
`sign_message`. The MCP server process (spawned by the agent runtime) is what
calls `ows` under the hood.

## Goals / Non-Goals

**Goals:**
- One command installs: OWS, wallet, policy, API key, MCP server, agent registration
- MCP server is the single interface between agent and wallet
- Works across OpenClaw, Claude Coworker, Codex via standard MCP config
- Fully testable including MCP signing flow
- Seamless: empty passphrase, no interactive prompts during agent operations

**Non-Goals:**
- Windows/Linux, on-chain AA deployment, daemon process
- Full AA transaction building (future MCP tool additions)

## Decisions

### D1: Architecture -- Agent -> MCP Server -> OWS

```
Agent (sandboxed)
  |
  | MCP stdio (JSON-RPC)
  v
MCP Server (Node.js process, spawned by agent)
  |
  | subprocess (OWS_PASSPHRASE=api_key)
  v
OWS CLI (ows sign message/tx)
  |
  | encrypted wallet
  v
~/.ows/ (wallet, keys, policies)
```

The agent runtime spawns the MCP server as a child process via stdio transport.
The MCP server reads the API key from `~/.ows/<name>.key` and passes it to OWS
as `OWS_PASSPHRASE` for policy-gated signing.

### D2: MCP server implementation

`installer/mcp-server/` contains:
```
mcp-server/
  package.json          # deps: @modelcontextprotocol/sdk
  index.js              # MCP server entry point
```

Initial tool: `sign_message(message, chain)` -> signature hex.
Internally: reads key file, spawns `ows sign message --wallet <name> --chain <chain> --message <msg>`.

The server reads `AGENT_WALLET_NAME` from env (set during MCP registration)
to know which wallet/key file to use.

### D3: MCP registration per agent

| Agent | Method | Config location |
|-------|--------|----------------|
| OpenClaw | `openclaw mcp set` | `~/.openclaw/openclaw.json` |
| Claude Coworker | `claude mcp add --scope user` or direct JSON write | `~/.claude.json` |
| Codex | TOML append | `~/.codex/config.toml` |

All three use stdio transport with `node` as the command:
```json
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-server/index.js"],
  "env": {
    "AGENT_WALLET_NAME": "agent-wallet"
  }
}
```

### D4: Skill file describes MCP tools (not OWS)

The SKILL.md teaches the agent about available MCP tools:
```markdown
## Available Tools (via MCP)
- **sign_message**: Sign a message. Params: message (string), chain (string).
```

The agent invokes these via its MCP client. The skill never mentions `ows`,
`OWS_PASSPHRASE`, or API keys.

### D5: Empty passphrase for seamless flow

Wallet created with empty passphrase. API key created with empty passphrase piped.
All OWS operations (create, delete, key create) use `echo "" | OWS_PASSPHRASE=""`.
Security is on-chain (AA policies), not local encryption.

### D6: Directory structure

```
installer/
  install.sh                    # TUI installer + management
  lib/
    functions.sh                # Core functions
    ui.sh                       # TUI helpers
    state.sh                    # State management
    skill-template.md           # SKILL.md template (MCP-aware)
    policy-template.json        # OWS policy template
  mcp-server/
    package.json                # MCP server deps
    index.js                    # MCP server entry point
  tests/
    run-tests.sh
    helpers.sh
    mocks/
      ows                       # Mock OWS binary
      uname                     # Mock uname
    test_*.sh                   # Test files
```

### D7: Self-test verifies MCP signing

The `--self-test` flag runs end-to-end including:
1. Install (wallet, policy, key, MCP server)
2. Start MCP server, send `sign_message` tool call, verify signature returned
3. Reinstall (cleanup + fresh install + verify signing works)
4. Uninstall

## Risks / Trade-offs

**[Risk] Node.js required** -> MCP server needs Node.js.
Mitigation: macOS ships without Node but most developers have it. Installer
checks and provides install instructions.

**[Risk] MCP config format changes** -> Each agent has its own config format.
Mitigation: Registration logic isolated per agent in `functions.sh`.

**[Risk] `claude` CLI not in PATH** -> Claude Coworker may be installed as
app only.
Mitigation: Fall back to writing `~/.claude.json` directly.

**[Trade-off] Stdio transport only** -> HTTP would allow remote MCP but
adds complexity.
Decision: Stdio is simpler, works for all three agents, and keeps everything local.
