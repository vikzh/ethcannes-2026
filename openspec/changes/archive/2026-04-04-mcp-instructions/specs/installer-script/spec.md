## MODIFIED Requirements

### Requirement: Custom MCP server
Add `instructions` option to the McpServer constructor. The instructions string
SHALL include: wallet name, wallet EVM address (resolved dynamically at startup),
chain info (Base), and usage guidance for available tools. The address SHALL be
read from OWS at server startup.

#### Scenario: MCP server returns instructions during init
- **WHEN** a client sends an `initialize` request
- **THEN** the response includes an `instructions` field with wallet address and tool guidance

#### Scenario: Instructions contain dynamic wallet address
- **WHEN** the MCP server starts with `AGENT_WALLET_NAME=agent-wallet`
- **THEN** the instructions include the actual EVM address from OWS (not a placeholder)

---

## REMOVED Requirements

### Requirement: Skill file teaches MCP tools

_(Replaced by MCP server `instructions` field. Agents receive tool guidance
automatically during MCP initialization -- no skill file needed.)_

---

## MODIFIED Requirements

### Requirement: MCP server registration per agent
Registration step SHALL only register MCP (no skill file creation). The installer
SHALL NOT create or manage SKILL.md files for any agent.

---

### Requirement: Interactive TUI -- management menu
Menu option [4] changes from "Reinstall skills" to "Reinstall MCP".
The operation deregisters and re-registers the MCP server for all detected agents.

---

### Requirement: Agent detection
Detection determines which agents to register MCP with. Skill installation
is removed from this flow.

---

### Requirement: --reinstall flag
Reinstall SHALL deregister MCP from all agents (no skill file cleanup needed).
