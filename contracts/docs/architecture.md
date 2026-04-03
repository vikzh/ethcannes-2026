# Architecture

## Directory layout

```
contracts/
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── interfaces/
│   │   ├── IERC7579Module.sol          — base module interface (onInstall, onUninstall, isModuleType)
│   │   ├── IERC7579Validator.sol       — validator interface (validateUserOp, isValidSignatureWithSender)
│   │   ├── IERC7579Hook.sol            — hook interface (preCheck, postCheck)
│   │   ├── IERC7579Account.sol         — account interface (execute, installModule, etc.)
│   │   ├── IOwnerValidator.sol         — owner-specific surface (transferOwnership, getOwner)
│   │   ├── IAgentSessionValidator.sol  — session lifecycle (createSession, revokeSession, getSession)
│   │   ├── IPolicyHook.sol             — policy config and whitelist management
│   │   ├── IWhitelistRequestModule.sol — pending request queue (request, approve, reject, cancel)
│   │   └── IEmergencyControls.sol      — pause, unpause, revokeSession, emergencyShutdown
│   ├── types/
│   │   ├── PolicyTypes.sol             — constants, privileged selectors, packValidationData
│   │   └── ExecutionTypes.sol          — ModeCode, CallType, Execution struct, decoders
│   ├── libs/
│   │   ├── SpendLimitLib.sol           — rolling-window spend limit enforcement
│   │   ├── WhitelistLib.sol            — (address, selector) tuple whitelist operations
│   │   └── ERC20SpendDecoder.sol       — decodes transfer/approve/transferFrom amounts
│   ├── validators/
│   │   ├── OwnerValidator.sol
│   │   └── AgentSessionValidator.sol
│   ├── hooks/
│   │   └── PolicyHook.sol
│   └── modules/
│       ├── WhitelistRequestModule.sol
│       └── EmergencyControls.sol
├── test/
│   ├── base/                           — shared fixtures and Hardhat helpers
│   ├── unit/                           — per-contract unit tests (*.test.ts)
│   └── integration/                    — end-to-end flows (*.test.ts)
├── script/
│   ├── deploy.ts
│   └── installModules.ts
└── docs/
    ├── project.md
    └── architecture.md                 — this file
```

## Module types

| Contract                 | ERC-7579 Type | ID |
|--------------------------|---------------|----|
| OwnerValidator           | Validator     | 1  |
| AgentSessionValidator    | Validator     | 1  |
| WhitelistRequestModule   | Executor      | 2  |
| EmergencyControls        | Executor      | 2  |
| PolicyHook               | Hook          | 4  |

## Execution flow

```
UserOp (agent-signed)
  │
  ▼
EntryPoint.handleUserOps()
  │
  ▼
Account.validateUserOp()
  ├── AgentSessionValidator.validateUserOp()
  │     checks: signature, session active, not expired, not revoked
  │     returns: packValidationData(failed, validAfter, validUntil)
  │
  ▼
Account.execute() / Account.executeBatch()
  │
  ▼
PolicyHook.preCheck()  ◄─ runs before every execution
  ├── paused?           → revert PolicyPaused
  ├── delegatecall?     → revert DelegatecallBlocked
  ├── privileged sel?   → revert PrivilegedCallBlocked
  ├── whitelisted?      → revert NotWhitelisted
  ├── native value cap  → revert NativeValueCapExceeded
  └── ERC-20 spend cap  → revert SpendLimitExceeded (via SpendLimitLib)
  │     (for executeBatch: loop all calls, accumulate spend before allowing any)
  │
  ▼
Execution proceeds
  │
  ▼
PolicyHook.postCheck()  (no-op in MVP)
```

## Whitelist granularity

The whitelist stores `(address target, bytes4 selector)` tuples.

- Exact match: `(target, selector)` — permits that specific function on that contract
- Wildcard: `(target, 0xffffffff)` — permits all functions on that contract
- Check order: exact match first, then wildcard fallback (see `WhitelistLib.isAllowed`)

Key computation: `keccak256(abi.encode(target, selector))` → `bool` in a per-account mapping.

## Spend limit windows

Each tracked ERC-20 token has an independent rolling window:

```
struct SpendLimit {
    token           address
    maxPerPeriod    uint256   — cap per window
    periodDuration  uint256   — window length in seconds
    spentInPeriod   uint256   — accumulated in current window
    periodStart     uint256   — block.timestamp of window start
}
```

Window reset: if `block.timestamp >= periodStart + periodDuration`, reset `spentInPeriod = 0` and `periodStart = block.timestamp`.

For `executeBatch`: spend accumulates across all calls in the batch. If the total exceeds the cap, the entire batch reverts (see `SpendLimitLib.checkAndAccumulate`).

ERC-20 functions tracked: `transfer`, `approve`, `transferFrom` (see `ERC20SpendDecoder`).

## Per-account storage isolation

Every module uses `mapping(address account => ...)` keyed by `msg.sender` (which is always the smart account in module calls). This allows a single deployed module contract to serve many accounts without storage collisions.

## Emergency controls coupling

The `paused` flag is stored in `PolicyHook`, not in `EmergencyControls`. This keeps enforcement in the hook's hot path without a cross-module call during `preCheck`. `EmergencyControls` is purely a privileged setter — it calls `policyHook.pause()` and `agentSessionValidator.revokeSession()` through the account's execute path.

## WhitelistRequestModule → PolicyHook coupling

`approveRequest(requestId, policyHook)` takes an explicit `policyHook` address parameter rather than storing it at install time. This avoids install-order dependencies between modules. The owner passes the correct `PolicyHook` address when approving.

## Privileged selector blocklist

These selectors are blocked for agent calls regardless of whitelist configuration (enforced in `PolicyHook.preCheck`):

| Selector                              | Function                          |
|---------------------------------------|-----------------------------------|
| `installModule(uint256,address,bytes)` | Module installation              |
| `uninstallModule(uint256,address,bytes)` | Module removal               |
| `transferOwnership(address)`          | Ownership transfer                |
| `setFallbackHandler(address)`         | Fallback handler replacement      |

## Dependencies

| Package | Purpose |
|---------|---------|
| `hardhat` | Compilation, testing, deployment |
| `@nomicfoundation/hardhat-toolbox` | ethers v6, TypeChain, chai matchers, gas reporter, coverage |
| `@account-abstraction/contracts` | `PackedUserOperation`, `IEntryPoint` |
| `@openzeppelin/contracts` | `ECDSA`, `SignatureChecker` |
| `@rhinestone/modulekit` | ERC-7579 account base and module helpers |

Install with:
```bash
cd contracts
npm install
```

## Solidity import paths

Imports reference npm package paths directly (no remappings needed):

```solidity
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@rhinestone/modulekit/src/...";
```
