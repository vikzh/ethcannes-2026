## Context

The frontend has a placeholder `/onboard` page that shows a single `npm install lishay-ai` command (stale). The real installer is a curl one-liner that produces an agent wallet address. After running the installer, the user currently has no guided path to deploy an AA account or fund the agent — they must use Hardhat scripts manually.

The smart contracts are deployed on Sepolia (addresses in `contracts/deployments/sepolia.json`). The factory's `deployAccount(bytes32 salt, address policyHook, ModuleInit[] modules, address agent)` is `payable` — when `msg.value > 0`, it forwards the ETH to the `agent` EOA for gas. The factory maintains `_walletByAgent` (one wallet per agent) and `_walletsByUser` (array — multiple wallets per user) lookup mappings.

The factory's `deployAccount` is a **one-shot setup**: it accepts a 5th parameter `agentSessionValidator` and calls `setAgentSessionValidator()` on the account internally after verifying the module is installed. The entire onboarding is a single wallet prompt, a single transaction.

The frontend stack is Next.js 16 (Turbopack), React 19, Tailwind CSS 4, wagmi 2, viem 2, RainbowKit 2 — all already in place.

## Goals / Non-Goals

**Goals:**
- Replace the placeholder `/onboard` page with a polished, step-by-step onboarding wizard
- Guide user from curl install → agent address input → one-click deploy+fund → success
- Single wallet prompt for the entire on-chain setup (one transaction)
- Auto-detect already-setup accounts via factory lookups and show status instead of re-running the flow
- Pre-fill agent address from `?agent=0x...` URL parameter (output by installer)
- Match the existing dashboard visual language (zinc palette, rounded cards, Tailwind utility classes)
- Contract addresses auto-update from `contracts/deployments/*.json` at build time — no manual sync

**Non-Goals:**
- Paymaster integration (plain ETH via msg.value for now)
- Module parameter customization (PolicyHook rules, spending limits) — hardcoded defaults
- Multi-agent per account (factory enforces one agent per account)
- Mobile-first design (desktop-focused hackathon demo)
- Backend changes — no new API routes

## Decisions

### 1. Multi-step wizard with linear stepper component

**Decision**: Build a `<Stepper>` component that renders numbered steps with active/complete/pending states. Each step is a discrete card section, not separate routes.

**Steps**: Install → Agent Address → Deploy & Fund → Complete (4 steps).

**Rationale**: Single-page stepper keeps all state in one component tree. This matches the hackathon demo flow.

**Alternative considered**: Multi-route wizard — rejected because it complicates state passing for a 4-step flow.

### 2. URL parameter `?agent=0x...` for pre-fill

**Decision**: Read `agent` from `URLSearchParams` on mount. If present and valid (42-char hex), pre-fill the agent address field and auto-advance past the input step.

**Rationale**: The installer outputs this URL at completion. The user clicks it and lands on a page where the address is already filled in. Manual paste is the fallback.

### 3. Account existence detection via factory lookups

**Decision**: Check account existence using the factory's on-chain mappings:
- `factory.getWalletByAgent(agentAddress)` — returns account address or `address(0)`
- `factory.getWalletsByUser(ownerAddress)` — returns array of account addresses

If `getWalletByAgent` returns non-zero, this agent already has an account → show status card. The user may have multiple accounts (the factory allows this), so the status card should be for the account bound to this specific agent.

**Rationale**: Direct factory lookups. Simple, authoritative, no salt computation or subgraph dependency.

### 4. Salt derivation

**Decision**: Compute salt as `keccak256(toBytes("wallet-" + Date.now()))` — matching the convention in `contracts/scripts/create-wallet-sepolia.ts`.

**Rationale**: The factory enforces uniqueness via `_walletByAgent`, so salt collision only matters for CREATE2 address prediction. Using a timestamp-based salt matches the existing codebase convention.

### 5. One-shot deploy + fund in single transaction

**Decision**: One wallet prompt. `factory.deployAccount{value: 0.005 ETH}(salt, policyHook, modules, agent, agentSessionValidator)` does everything:
- Deploys account via CREATE2
- Installs all modules (PolicyHookRuleSpend, WhitelistRequestModule, EmergencyControls, AgentSessionValidator)
- Verifies AgentSessionValidator is installed, calls `setAgentSessionValidator()` on the account
- Transfers ownership to `msg.sender`
- Forwards `msg.value` to agent EOA for gas
- Registers agent and user in factory lookup mappings

Total: **1 wallet prompt, 1 transaction**.

**Rationale**: The factory's 5th parameter `agentSessionValidator` handles this internally — verified on the latest deployed contract (`0xA9C2365...`). Best UX — user confirms once and the account is fully operational.

### 6. Contract settings with compile-based ABI import (`src/lib/contracts.ts`)

**Decision**: Import everything from the contracts directory at build time via two Turbopack aliases:
- `@deployments` → `contracts/deployments/` — deployed addresses (JSON)
- `@artifacts` → `contracts/artifacts/` — compiled ABIs (generated by Hardhat)

A `prebuild`/`predev` script in `frontend/package.json` runs `hardhat compile` before each build/dev start, so artifacts are always fresh. Nothing is hardcoded — addresses come from deployment JSON, ABIs come from compiled Solidity.

Exports: typed `DEPLOYMENTS` record, `FACTORY_ABI` (full from artifact), `ACCOUNT_ABI` (full from artifact), `buildModuleInits()`, `computeSalt()`, `DEFAULT_GAS_FUND_ETH`, explorer URL helpers.

**Rationale**: Contracts are actively developed — both the interface (new functions/params) and deployment addresses change frequently. Importing both from source-of-truth eliminates manual sync entirely. ABIs from compiled artifacts are always correct by construction.

**Alternative considered**: Hardcoded ABI fragments — rejected because the contract interface changes frequently (e.g., `deployAccount` went from 3→4→5 params in three iterations). Env vars for addresses — rejected because managing 5+ addresses as env vars is error-prone.

### 7. Component structure

```
src/app/onboard/page.tsx          — Page component, reads URL params, orchestrates wizard
src/components/onboard/
  stepper.tsx                     — Reusable numbered step indicator
  step-install.tsx                — Step 1: curl command + copy button
  step-agent-address.tsx          — Step 2: agent address input/pre-fill
  step-deploy-account.tsx         — Step 3: one-shot deploy+fund
  step-complete.tsx               — Step 4: success summary
  account-status.tsx              — Already-setup status card (shown instead of wizard)
  tx-status.tsx                   — Reusable transaction lifecycle indicator
src/lib/contracts.ts              — Imports deployment JSON, exports ABIs + helpers
```

### 8. Visual design language

Follow the existing dashboard patterns:
- `bg-white`, `text-zinc-900`, zinc palette
- `rounded-[28px]` cards with `border border-zinc-200` and `shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]`
- Step indicator: emerald for complete, zinc-900 for active, zinc-300 for pending
- Code blocks: `bg-[#282c34]`
- Transaction states: amber for pending, emerald for confirmed, rose for failed

## Risks / Trade-offs

**[Risk] Factory allows multiple wallets per user**: A user could deploy multiple accounts for different agents. The wizard always creates a new one. → **Mitigation**: Detection is per-agent (`getWalletByAgent`), not per-user. If the agent already has a wallet, the status card is shown regardless of how many other wallets the user has.

**[Risk] Sepolia RPC rate limits**: Multiple on-chain reads could hit rate limits. → **Mitigation**: Alchemy RPC is configured via `NEXT_PUBLIC_SEPOLIA_RPC_URL` in `.env` (already set up in Vercel).

**[Risk] Deployment JSON stale during dev**: If someone redeploys contracts but doesn't restart the dev server, addresses will be stale. → **Mitigation**: This is inherent to build-time imports. The dev server restart is cheap and expected after a contract redeploy.
