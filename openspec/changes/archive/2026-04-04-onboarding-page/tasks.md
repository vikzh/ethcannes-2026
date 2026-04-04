## 1. Contract Settings File (done)

- [x] 1.1 `frontend/src/lib/contracts.ts` — imports addresses from `@deployments/sepolia.json` and full ABIs from `@artifacts/` (Hardhat compiled output) at build time. Exports typed `DEPLOYMENTS`, `FACTORY_ABI` (full from artifact), `ACCOUNT_ABI` (full from artifact), `buildModuleInits()`, `computeSalt()`, `DEFAULT_GAS_FUND_ETH`, explorer helpers. Turbopack aliases in `next.config.ts` for `@deployments` and `@artifacts`. Tsconfig paths for both. `prebuild`/`predev` scripts in `package.json` run `hardhat compile` automatically. **Verified**: `next build` compiles and type-checks successfully.

## 2. Reusable Components (done)

- [x] 2.1 Create `frontend/src/components/onboard/stepper.tsx` — numbered step indicator with complete/active/pending states, emerald check for complete, zinc-900 for active, zinc-300 for pending, connecting lines that fill. Props: `steps: string[]`, `currentStep: number`.

- [x] 2.2 Create `frontend/src/components/onboard/tx-status.tsx` — reusable transaction status component with idle/confirming/pending/confirmed/failed states. Props: `status`, `txHash`, `error`, `chainId`, `onRetry`. Shows spinner, Etherscan link (via `txUrl()`), or retry button.

## 3. Wizard Step Components (done)

- [x] 3.1 Create `frontend/src/components/onboard/step-install.tsx` — curl command in dark code block with copy button, brief description, "Continue" button.

- [x] 3.2 Create `frontend/src/components/onboard/step-agent-address.tsx` — text input with paste button, address validation (42-char hex), "Continue" button disabled until valid. Accepts `initialAddress` prop for URL pre-fill.

- [x] 3.3 Create `frontend/src/components/onboard/step-deploy-account.tsx` — one-shot deploy+fund step. Uses wagmi `useWriteContract` to call `factory.deployAccount{value: 0.005 ETH}(salt, policyHook, modules, agent, agentSessionValidator)`. Salt from `computeSalt()`. Modules from `buildModuleInits()`. Single wallet prompt — the factory handles everything. Shows `<TxStatus>`. Error + retry on failure (retry generates new salt).

- [x] 3.4 Create `frontend/src/components/onboard/step-complete.tsx` — success summary card with emerald icon, account/owner/agent addresses with copy buttons, funded amount, installed modules list, Etherscan link, "Go to Dashboard" button.

## 4. Account Status Card (done)

- [x] 4.1 Create `frontend/src/components/onboard/account-status.tsx` — status card for already-setup accounts. Shows account address, owner (read on-chain), agent, ETH balances (account + agent fetched on-chain), "Active" badge, Etherscan link, dashboard link. Shows "Fund agent" button if agent balance is 0. Shows warning if `account.agentSessionValidator()` returns `address(0)`.

## 5. Page Orchestration (done)

- [x] 5.1 Rewrite `frontend/src/app/onboard/page.tsx` — main onboarding page. Reads `agent` URL search parameter. Manages wizard state. Gates on wallet connection + Sepolia network. Runs account existence detection via `factory.getWalletByAgent()`. Renders stepper + current step component, or account status card if account exists.

- [x] 5.2 Add Sepolia network validation — if connected wallet is on wrong chain, show "Switch to Sepolia" prompt using wagmi `useSwitchChain`. Disable wizard steps until on correct network.

## 6. Installer Update (done)

- [x] 6.1 Update `installer/lib/ui.sh` `print_summary_box` to include the onboarding URL. Default base URL: `https://myleashai.vercel.app/onboard` (production). Override: `AGENT_ONBOARD_URL=http://localhost:3000/onboard`. Format: `Onboard:  <base>?agent=0x<ADDRESS>`.

## 7. Playwright E2E Test Suite (done)

- [x] 7.1 Install Playwright as a devDependency. Create `frontend/playwright.config.ts` with `webServer` pointing to `npm run dev`, Chromium-only, dotenv loading.

- [x] 7.2 Create `frontend/e2e/helpers/wallet.ts` — test helper: `getOwnerAccount()` from `TEST_MNEMONIC`, `getWalletClient()`, `getPublicClient()`, `generateAgentAddress()` (random per run), `getBalance()`.

- [x] 7.3 Create `frontend/e2e/onboard.spec.ts` — 5 tests: page render + stepper, agent pre-fill from URL, invalid param ignored, address validation, full deploy placeholder (requires TEST_MNEMONIC).

- [x] 7.4 Add `"test:e2e": "playwright test"` to `package.json`. Add `TEST_MNEMONIC` and `TEST_RPC_URL` to `.env.example`.

## 8. Manual Smoke Test

- [ ] 8.1 Manual end-to-end smoke test with real MetaMask: run the curl installer locally (with `AGENT_ONBOARD_URL=http://localhost:3000/onboard`), copy the onboarding URL from the summary, open in browser, connect MetaMask on Sepolia, verify agent address is pre-filled, click "Deploy & Fund" (single wallet prompt), confirm tx, verify success card. Revisit the URL — verify status card appears with balances. **Verify**: full flow works end-to-end; revisit shows status.
