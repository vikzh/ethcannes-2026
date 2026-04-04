## REMOVED Requirements

### Requirement: Skill content validates MCP (not OWS)

_(No longer needed -- skill files are removed. MCP instructions are tested
via the MCP server unit tests instead.)_

---

## MODIFIED Requirements

### Requirement: MCP server unit tests
Add test: verify `initialize` response includes `instructions` field with
wallet address and tool guidance.

#### Scenario: Initialize returns instructions
- **WHEN** `initialize` JSON-RPC request is sent to MCP server
- **THEN** response contains `instructions` field
- **AND** instructions mention `sign_message` and `get_address`

---

### Requirement: Integration test -- full happy path
Remove assertions for skill file creation. Add assertion that MCP is registered
for each agent. No skill files should exist after install.

#### Scenario: No skill files created
- **WHEN** full install completes
- **THEN** no `SKILL.md` files exist in agent skill directories
- **AND** MCP is registered for all detected agents

---

### Requirement: MCP deregistration tests
Verify uninstall removes MCP config only (no skill directory cleanup needed).

---

### Requirement: Self-test with MCP signing
Self-test SHALL verify MCP instructions are present in initialize response
in addition to signing verification.
