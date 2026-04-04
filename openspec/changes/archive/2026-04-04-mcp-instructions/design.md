## Context

The installer currently writes SKILL.md files to teach agents about MCP tools. The
MCP specification has an `instructions` field on `InitializeResult` that serves this
purpose natively. Claude Coworker never reads skill files, making them useless for
that agent. Moving to MCP instructions fixes Claude and removes duplication.

## Goals / Non-Goals

**Goals:**
- Agent wallet instructions delivered via MCP `instructions` field (auto-injected)
- Dynamic content: wallet address resolved at MCP server startup
- No more skill file creation, templating, or management
- Simpler installer flow and smaller codebase

**Non-Goals:**
- MCP prompts (user-triggered templates) -- different mechanism, future concern
- Changing the MCP tool interface (sign_message, get_address stay the same)
- Changing wallet/policy/key creation flow

## Decisions

### D1: Use `instructions` option on McpServer constructor

```js
const server = new McpServer(
  { name: "agent-wallet", version: "0.1.0" },
  {
    instructions: `You have an on-chain agent wallet managed by OWS.
Wallet: ${walletName}, Address: ${address}, Chain: Base (eip155:8453).
Use sign_message to sign payloads. Use get_address to retrieve your address.
All signing is via this MCP server -- never call OWS directly.`
  }
);
```

The `instructions` string is sent during the `initialize` handshake. The spec says
clients "MAY" add it to the system prompt. In practice all three target agents
(OpenClaw, Claude Coworker, Codex) respect this.

The wallet address is resolved dynamically by reading it from `ows wallet list`
at server startup (same OWS subprocess pattern used for signing).

### D2: Remove all skill file machinery

Delete from `functions.sh`:
- `SKILL_PATH_OPENCLAW`, `SKILL_PATH_CLAUDE`, `SKILL_PATH_CODEX` constants
- `get_skill_dir`, `install_skill`, `remove_skill`, `build_agents_json`

Delete `installer/lib/skill-template.md`.

Remove skill-related fields from state file (`installed_agents` array no longer
tracks skill paths -- only tracks which agents have MCP registered).

### D3: Simplify install flow

Current step 8: "Register MCP + install skill" per agent.
New step 8: "Register MCP" per agent (no skill creation).

Management menu option [4] changes from "Reinstall skills" to "Reinstall MCP"
(deregisters and re-registers MCP for all detected agents).

### D4: State file simplification

The `installed_agents` field currently stores:
```json
[{"type": "openclaw", "path": "~/.openclaw/skills/agent-wallet/SKILL.md"}]
```

Change to store only agent types with MCP registered:
```json
["openclaw", "claude", "codex"]
```

The `path` field is no longer needed since there are no skill files.

## Risks / Trade-offs

**[Risk] Agent doesn't inject MCP instructions into prompt** -> Spec says "MAY".
Mitigation: Tool descriptions already include parameter docs. Instructions add
context (address, chain) but tools are still usable without them. Verified with
OpenClaw e2e test that MCP tools work.

**[Trade-off] OpenClaw/Codex lose progressive disclosure** -> Skill files used
two-stage loading (metadata always, body on-demand). MCP instructions are always
sent in full (~200 chars). Acceptable given the small size.

**[Trade-off] No offline documentation** -> Skill files served as local docs.
MCP instructions are only available when the server runs. Acceptable since the
agent only needs instructions when it's about to use the tools.
