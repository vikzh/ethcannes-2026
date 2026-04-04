## Why

The installer produces an agent wallet address but there is no frontend flow that connects that address to an on-chain AA account. Users must manually copy addresses and run Hardhat scripts to deploy accounts and fund gas. We need a guided onboarding page that takes the user from "install the CLI" to "AA account created and funded" in a single browser session, with clear status for wallets that already completed setup.

## What Changes

- New `/onboard` page replaces the current placeholder (single copy-to-clipboard command) with a multi-step onboarding wizard
- Step 1: Connect owner wallet (RainbowKit), display the curl install command with copy button
- Step 2: Accept agent wallet public address — either pre-filled via `?agent=0x...` URL parameter (output by installer) or pasted manually
- Step 3: One-click deploy+fund — single `factory.deployAccount{value: 0.005 ETH}()` transaction that deploys the AA account, installs all modules, sets the agent session validator, and funds the agent for gas. One wallet prompt, one transaction.
- Step 4: Success state with account summary and link to dashboard
- When the page is opened with an agent address that already has an AA account deployed, skip to a status view showing the existing account, its modules, and funding status
- The installer's summary output will include the full onboarding URL (e.g., `http://localhost:3000/onboard?agent=0x...`) so the user can click through directly
- New `src/lib/contracts.ts` imports deployment addresses from `contracts/deployments/sepolia.json` at build time — addresses auto-update when contracts are redeployed (restart dev server to pick up changes)

### Contract setup (one-shot, no mocks)

The factory's `deployAccount` is being updated to handle the complete setup in a single call:
- Deploys account, installs modules, calls `setAgentSessionValidator`, transfers ownership, funds agent
- Module parameters use sensible defaults: PolicyHookRuleSpend with no native value cap, AgentSessionValidator with no time bounds
- Gas funding amount is `0.005 ETH` — forwarded to the agent EOA via `msg.value`
- Account existence detection uses factory's `getWalletByAgent()` on-chain lookup

## Capabilities

### New Capabilities
- `onboarding-page`: Full onboarding wizard UI — multi-step flow, URL parameter pre-fill, wallet connection gating, single-transaction deploy+fund, status detection for already-setup accounts, responsive and polished UX matching the existing dashboard design language

### Modified Capabilities
- `installer-script`: The installer's post-install summary must output the onboarding URL with the `?agent=` parameter containing the wallet's EVM address

## Impact

- **Frontend**: New page at `src/app/onboard/page.tsx` (replaces existing placeholder), new components for stepper UI, transaction status, account status card
- **Frontend config**: `next.config.ts` updated with Turbopack `resolveAlias` for `@deployments`. `tsconfig.json` paths entry added. `src/lib/contracts.ts` created.
- **Installer**: Minor change to summary output to print the onboarding URL
- **Dependencies**: No new npm packages — wagmi + viem already handle contract writes and ETH transfers
- **Contracts**: Factory is being updated to internalize `setAgentSessionValidator` (separate work). Frontend gracefully handles both old and new contract versions via status card checks.
