## Why

AI coding agents need a secure local wallet and skill configuration to interact with
on-chain Account Abstraction contracts. Today there is no automated way to provision
an OWS wallet scoped to a specific AA contract, generate a policy-restricted API key
for the agent, install the agent skill across multiple runtimes (OpenCode, Claude Code,
OpenAI Codex), and manage the lifecycle of that setup over time. Without this, every
user must manually run a dozen CLI commands and hand-edit config files -- a non-starter
for adoption.

This tool will be actively developed -- skills, SDK utilities, and AA tooling will be
added incrementally. The update/management flow is as important as the initial install.

## What Changes

- New `installer/` directory at project root containing an interactive TUI-based
  installer script (`install.sh`), reusable function library, skill templates, and
  a full test harness
- First run: guided TUI walks through OWS install, wallet creation, chain policy,
  API key, agent skill installation. Outputs the agent's public EVM address.
- Subsequent runs: TUI presents a management menu (status, update policy, regenerate
  key, reinstall skills, fresh reinstall, full uninstall)
- Self-verifying install one-liner with SHA256 hash check for supply chain protection
- A test harness validates the full installation and management flows in sandboxed
  environments (temp HOME, mock OWS, mock agent dirs) without touching the real
  filesystem or requiring real chain access

## Capabilities

### New Capabilities
- `installer-script`: Interactive TUI bash installer -- OWS provisioning, wallet
  creation, chain policy, API key, agent detection, skill installation, lifecycle
  management (status, update, regenerate, uninstall). All artifacts under `installer/`.
- `installer-testing`: Test strategy and harness -- unit tests per function,
  integration tests for install + management flows in sandboxed environments,
  mock fixtures for OWS CLI and agent directories.

### Modified Capabilities
_(none -- no existing specs are changed)_

## Impact

- **New directory**: `installer/` at repo root (script, lib, templates, tests, mocks)
- **Depends on**: OWS CLI (`ows` binary) available or installable via official installer
- **Depends on**: Agent runtimes (at least one of: `opencode`, `claude`, `codex`)
- **Frontend**: Will eventually serve the install one-liner -- separate change
- **No contract changes**: This change is purely client-side tooling
