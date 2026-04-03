# Project Description: Agent Wallet on ERC-7579 with Custom Policies

## Overview

This project proposes a modular smart account wallet built on top of the **ERC-7579** account model with a set of **custom policy modules** designed for AI agents and delegated automation.

The goal is to let a human owner safely delegate limited execution rights to an agent while keeping full control over governance, permissions, and security-sensitive actions.

In this model, the wallet is controlled by two distinct actors:

* **Human owner** — the root authority of the wallet
* **Agent** — a restricted delegated actor that can execute transactions only within predefined rules

The wallet should support practical controls such as:

* address + function selector whitelists (granular per-target permissions)
* per-transaction native token value caps
* per-token ERC-20 spend caps with rolling time windows
* time-based session expiration
* human approval for whitelist additions
* batch execution with per-call policy enforcement

This architecture is intended for use cases such as autonomous trading assistants, treasury automation, payment agents, workflow bots, subscription managers, and AI-powered wallet operations where automation is desirable but unrestricted agent access would be unsafe.

---

## Problem Statement

Existing wallets usually operate in one of two extremes:

1. **EOA-style full control** — any signer with access to the key has complete authority
2. **Multisig/manual control** — strong security, but poor UX for fast or automated workflows

For agent-driven systems, neither model is ideal.

An agent should not have full wallet ownership. At the same time, requiring a human signature for every operation removes most of the value of automation.

The missing model is a wallet where:

* the human remains the ultimate owner
* the agent can act independently inside a narrow permission box
* the policy box is enforced onchain
* the agent can request new permissions
* the human approves or rejects those requests explicitly

This project addresses that gap by combining a modular account standard with custom permission and approval logic.

---

## Core Idea

The wallet is an **ERC-7579-compatible smart account** that installs multiple modules, each with a focused responsibility.

At a high level:

* the **owner validator** authenticates the human owner
* the **agent session validator** authenticates the agent session key
* custom **policy hooks/modules** restrict what the agent can do
* a **whitelist request module** allows the agent to propose new allowed targets
* only the human owner can approve changes to the active whitelist

This creates a secure split between:

* **execution authority** for the agent
* **governance authority** for the human

---

## Objectives

### Primary objectives

* Build an agent-friendly wallet using ERC-7579 modular architecture
* Support delegated execution without giving the agent full ownership
* Enforce onchain limits and whitelists for agent actions
* Allow the agent to request whitelist additions
* Require explicit human approval before whitelist changes become active
* Keep the design extensible for future modules such as recovery, risk scoring, multi-agent roles, or compliance rules

### Secondary objectives

* Make policies easy to audit and reason about
* Minimize blast radius in case of agent compromise or bad behavior
* Allow temporary or renewable agent sessions
* Support progressive decentralization from single-owner control to multisig or policy committees later

---

## Why ERC-7579

ERC-7579 is a strong fit because it enables a **modular smart account architecture** where features are implemented as installable components rather than hardcoded into one wallet contract.

This is especially useful for agent wallets because the product naturally decomposes into separate concerns:

* signature validation
* session authorization
* execution permissions
* spend controls
* whitelist management
* emergency controls

Instead of building a monolithic wallet with custom logic for everything, the project can rely on a modular account base and add specialized policies on top.

Key benefits of this approach:

* cleaner separation of responsibilities
* easier upgrades and iteration
* more reusable modules
* clearer security review boundaries
* better interoperability with the modular account ecosystem

### Transaction model

The MVP uses **regular onchain transactions** without EntryPoint, paymaster, or bundler dependencies. The account supports owner direct execution for admin actions and EIP-712 signed delegated execution for agents. Session validity and policy checks are enforced onchain before execution.

### Account base

The project includes a custom isolated account implementation for networks where ERC-4337 infrastructure is not required. It keeps ERC-7579-style module separation (validator/executor/hook) while using standard transactions.

---

## Functional Requirements

### 1. Human owner control

The human owner must be able to:

* create and revoke agent sessions
* update/replace agent address
* configure limits and policies
* approve or reject whitelist additions
* update whitelist entries manually
* pause or unpause agent execution
* rotate owner credentials
* upgrade or replace policy modules if governance allows it

### 2. Agent execution

The agent must be able to:

* execute transactions only within policy constraints
* interact only with whitelisted addresses or approved protocols
* stay within configured spend limits
* operate only during an active session window
* request new whitelist additions
* optionally cancel its own pending requests

### 3. Whitelist approval flow

The system must support a two-step whitelist process:

1. The agent submits a request to add a `(target address, function selector)` tuple
2. The human owner approves or rejects the request

A requested tuple must not become active until owner approval is finalized.

### 4. Policy enforcement

The wallet must support enforcement of rules such as:

* allowed `(target address, function selector)` pairs — the whitelist is tuple-based, not address-only
* wildcard selector (`0xffffffff`) to allow all functions on a given target
* native token value cap per transaction
* per-token ERC-20 spend caps with configurable rolling time windows
* session expiration checked against `block.timestamp`
* `delegatecall` blocked for agent sessions
* blocked calls to privileged account-management functions (module install/uninstall, ownership transfer)
* per-call enforcement within `executeBatch` — all calls checked individually, spend limits accumulate across the batch

### 5. Emergency controls

The wallet should support at least:

* immediate session revocation
* emergency pause of agent activity
* owner-only recovery path

---

## Non-Functional Requirements

* **Security-first design** — restrictive by default
* **Modularity** — policies and validators should be separable
* **Auditability** — state transitions and permissions should be easy to inspect
* **Extensibility** — new policy types should be addable later
* **Operational clarity** — humans should understand why a transaction is allowed or rejected
* **Low trust in agent** — system should assume the agent may misbehave or be compromised

---

## Proposed Architecture

### 1. ERC-7579 smart account

The base account provides modular account functionality and execution entrypoints.

It should support installation of validators, hooks, and executor-related modules needed for policy-aware execution.

### 2. Owner validator

This validator authenticates the human owner.

Typical responsibilities:

* validate owner signatures
* authorize admin-level actions
* approve whitelist additions
* modify policy configuration
* revoke sessions
* trigger emergency controls

This validator represents the root authority of the account.

### 3. Agent session validator

This validator authenticates the agent session key.

The agent session key is an **EOA keypair** issued to the agent. The session is represented onchain by a struct containing:

* the agent's public address
* session start and expiry timestamps
* a nonce or session ID for revocation

Unlike an owner validator, it should not simply treat the agent as another full owner. Instead, it should validate that:

* the session key signature is valid
* the session has not expired (checked against `block.timestamp`)
* the session has not been revoked
* the action fits the policy constraints
* the transaction does not target privileged account-management operations

This validator represents constrained delegated authority.

### 4. Policy hook (execution hook)

This component enforces transaction-level restrictions as an **ERC-7579 execution hook** — it runs before each execution call, not during validation. This separation keeps validation lightweight (signature + session checks only) and moves policy enforcement to the hook layer where full calldata is available.

The hook checks:

* target address + function selector pair is in the active whitelist
* `msg.value` is below the per-transaction native token cap
* ERC-20 spend amount (decoded from calldata for `transfer` / `approve` / `transferFrom`) is within remaining token allowance for the current period
* the call type is not `delegatecall` (blocked for agent sessions)
* for `executeBatch`, every call in the batch is individually checked

#### Whitelist granularity

The whitelist stores **`(target address, bytes4 selector)`** tuples. A wildcard selector value (`0xffffffff`) may be used to allow all functions on a given target. Each entry is either active or inactive.

#### Spend limit time windows

Spend limits use a **rolling window based on `block.timestamp`**. Each token has:

* `maxPerPeriod` — maximum spend amount per window
* `periodDuration` — window length in seconds (e.g., 86400 for daily)
* `spentInCurrentPeriod` — accumulated spend in the current window
* `periodStart` — timestamp when the current window began

When a transaction occurs, if `block.timestamp >= periodStart + periodDuration`, the window resets. Otherwise, `spentInCurrentPeriod` is incremented and checked against `maxPerPeriod`.

Per-token limits are tracked independently. There is no aggregate cross-token cap in the MVP.

#### Batch execution

The MVP supports `executeBatch`. The policy hook iterates over each call in the batch and enforces all checks per-call. Spend limits accumulate across calls within the same batch. If any single call in the batch violates policy, the entire batch reverts.

### 5. Whitelist request module

This module manages the request/approval lifecycle for new `(address, selector)` whitelist entries.

Responsibilities:

* store pending whitelist requests as `(target, selector, metadata)` tuples
* emit request events with the full tuple for offchain monitoring
* allow owner approval or rejection per request
* activate whitelist entries in the policy hook only after owner approval
* support the agent cancelling its own pending requests

### 6. Emergency controls module

Optional but highly recommended.

Responsibilities:

* pause agent execution
* freeze session validator access
* optionally enforce delayed recovery or guardian intervention in later versions

---

## Permission Model

### Human owner permissions

The human owner can:

* install or remove modules
* configure policies
* set spend limits
* create, renew, or revoke sessions
* approve whitelist additions
* manage emergency controls
* change wallet governance

### Agent permissions

The agent can:

* execute approved transactions
* request whitelist additions
* act only while session is valid
* act only within configured limits

### Explicitly forbidden agent powers

The agent must not be able to:

* change ownership
* install or uninstall modules
* modify validator logic
* approve its own whitelist additions
* bypass policy via arbitrary delegatecall
* use generic execution wrappers to escape restrictions
* disable pause or recovery controls

---

## Example Execution Flow

### Flow A — normal allowed transaction

1. Human creates an agent session
2. Human configures limits and active whitelist
3. Agent signs a transaction
4. Agent session validator verifies the session key
5. Policy module checks whitelist, method, amount, and limits
6. If all checks pass, the transaction executes

### Flow B — new address request

1. Agent wants to interact with a new destination or function
2. Agent submits `requestWhitelistAddition(target, selector, metadata)`
3. Request is stored as pending with the `(target, selector)` tuple
4. Human reviews the request
5. Human approves or rejects it
6. If approved, the address becomes active in the whitelist
7. Agent may use the new target only after approval

### Flow C — emergency response

1. Human detects suspicious behavior or compromised agent
2. Human revokes session or pauses the wallet
3. Agent execution is immediately blocked
4. Human rotates keys or updates policy before re-enabling operations

---

## Security Considerations

This project should be designed under the assumption that agent compromise is possible.

### Main security principles

* restrict first, expand later
* separate execution from governance
* do not treat agent key as co-owner
* avoid relying only on target/selector checks when calldata can encode dangerous behavior
* decode and inspect parameters where needed
* block or tightly control delegatecall and generic multicall patterns
* maintain clear emergency shutdown paths

### Important design risks

#### 1. Selector-only policy is insufficient

A router or multicall contract may appear allowed while still enabling unwanted downstream behavior. The tuple-based `(address, selector)` whitelist mitigates this partially, but callers should avoid whitelisting generic routers or multicall targets where the downstream call is encoded in calldata. For the MVP, this is an operational concern — owners should whitelist specific protocol entry points, not generic dispatchers.

#### 2. Generic execute wrappers can become escape hatches

If the agent can submit arbitrary nested calls, policy enforcement may be bypassed unless calldata is decoded and restricted. The MVP blocks `delegatecall` for agent sessions entirely and enforces per-call checks within `executeBatch`. Owners should not whitelist contracts that provide arbitrary `execute`-style forwarding.

#### 3. Spend tracking must be precise

Limits must be tracked consistently across token types, periods, and batched execution. The MVP uses per-token rolling windows with `block.timestamp`-based resets. Spend is accumulated across all calls in a batch before any execution occurs, so a batch cannot split a large spend into individually-passing sub-calls.

#### 4. Policy misconfiguration can create unsafe sessions

Admin UX should make policy scope highly visible and easy to review.

#### 5. Emergency controls must remain owner-accessible

Pause and revocation paths should never depend on agent cooperation.

---

## MVP Scope

### In scope for MVP

* isolated modular account with regular transaction execution (no EntryPoint/paymaster)
* owner validator (ECDSA signature validation)
* agent session validator (EOA session key with expiry and revocation)
* `(address, selector)` tuple-based whitelist with wildcard selector support
* pending whitelist request flow with owner approval
* per-transaction native token value cap
* per-token ERC-20 spend caps with rolling time windows
* policy enforcement as an ERC-7579 execution hook
* `executeBatch` support with per-call policy checks
* `delegatecall` blocked for agent sessions
* session expiry and revocation
* owner-only emergency pause
* end-to-end Hardhat tests covering allowed execution, rejected execution, whitelist request/approval, spend limit enforcement, and emergency pause

### Out of scope for MVP

* cross-chain execution
* multiple concurrent agent roles
* intent-based routing
* reputation-based policy adaptation
* social recovery
* DAO or committee governance
* complex offchain policy engines
* aggregate cross-token spend caps (oracle-denominated)
* transaction count limits (deferred — spend caps are sufficient for MVP)

---

## Future Extensions

Potential future expansions include:

* multiple agent roles with different policies
* protocol templates for DeFi actions
* recurring payment modules
* human-in-the-loop approvals for high-risk actions
* guardian-based recovery
* multisig owner governance
* offchain simulation before execution
* risk scoring for requested whitelist additions
* spending policies based on oracle-denominated value
* cross-chain policy synchronization

---

## Target Use Cases

### 1. AI treasury assistant

An agent can pay approved vendors, rebalance funds within limits, and request access to a new counterparty.

### 2. Trading or execution bot

An agent can trade only through approved protocols and only within capped exposure.

### 3. Subscription/payment automation

An agent can process recurring payments to approved recipients without full wallet control.

### 4. Workflow or operations bot

An agent can interact with pre-approved contracts for claims, settlements, or protocol maintenance.

### 5. Enterprise delegated wallet

Teams can allow service agents to act operationally while treasury signers retain governance authority.

---

## Success Criteria

The project is successful if it demonstrates that:

* a human can safely delegate execution to an agent
* the agent can perform useful work without full wallet ownership
* whitelist changes remain human-controlled
* onchain policies reliably prevent out-of-scope execution
* the architecture remains modular and extensible

---

## Summary

This project aims to build a practical **agent wallet** using an **ERC-7579 modular account** and a set of **custom policy modules**.

The central design principle is simple:

* **human owns the wallet**
* **agent operates within constrained policy boundaries**
* **permission expansion requires explicit human approval**

This makes the wallet suitable for real-world agent automation without collapsing into either unsafe full delegation or inefficient full manual control.

The result is a security-aware smart account architecture for the next generation of autonomous onchain systems.
