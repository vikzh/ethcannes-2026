## ADDED Requirements

### Requirement: Onboarding page at /onboard route
The frontend SHALL serve an onboarding wizard page at the `/onboard` route. The page
SHALL replace the existing placeholder. The page SHALL be a client component that uses
wagmi hooks for wallet connection and transaction signing. The page SHALL use the shared
`<Header />` component and match the existing dashboard visual language (zinc palette,
rounded cards, Tailwind utility classes).

#### Scenario: User navigates to /onboard
- **WHEN** user visits `/onboard`
- **THEN** the page renders with the shared header and the onboarding wizard content

---

### Requirement: Owner wallet connection gate
The onboarding wizard SHALL require the user to connect their owner wallet (EOA) via
RainbowKit before any wizard steps are actionable. If the wallet is not connected, the
page SHALL display a prominent "Connect wallet" prompt with the existing RainbowKit
connect button. The connected wallet address is the `owner` of the AA account.

#### Scenario: Wallet not connected
- **WHEN** user visits `/onboard` without a connected wallet
- **THEN** the wizard steps are visible but disabled/dimmed, and a "Connect your wallet to get started" prompt is displayed

#### Scenario: Wallet connected
- **WHEN** user connects their wallet via RainbowKit
- **THEN** the wizard steps become interactive and the connected address is displayed as the owner

#### Scenario: Wallet disconnected mid-flow
- **WHEN** user disconnects wallet while wizard is in progress
- **THEN** the wizard resets to the connection prompt state, preserving the agent address URL parameter

---

### Requirement: Step indicator (stepper) component
The page SHALL display a numbered step indicator showing the current progress through
the onboarding flow. Steps SHALL have three visual states: complete (emerald check),
active (zinc-900 filled), and pending (zinc-300 outline). Steps SHALL be connected
by lines that fill with color as steps complete. The stepper component SHALL be
reusable (`src/components/onboard/stepper.tsx`).

The steps are:
1. Install Agent Wallet
2. Agent Address
3. Deploy & Fund Account
4. Complete

#### Scenario: Initial state
- **WHEN** user lands on the page with wallet connected
- **THEN** step 1 is active, steps 2-4 are pending

#### Scenario: Step completion
- **WHEN** a step is completed
- **THEN** the step indicator updates to show the completed step with an emerald check mark, the next step becomes active, and the connecting line fills

---

### Requirement: Step 1 — Install Agent Wallet
The first step SHALL display the curl install command in a dark code block (`bg-[#282c34]`)
with a one-click copy button. The command SHALL be:
```
curl -fsSL https://raw.githubusercontent.com/vikzh/ethcannes-2026/main/installer/get.sh | bash
```
The step SHALL include a brief description explaining that this installs the agent wallet
locally. A "Continue" button SHALL advance to step 2. There is no automated verification
that the user actually ran the command — it is trust-based for this hackathon scope.

#### Scenario: User copies the command
- **WHEN** user clicks the copy button
- **THEN** the command is copied to clipboard and the button shows a "Copied" confirmation for 1.5 seconds

#### Scenario: User advances past install step
- **WHEN** user clicks "Continue"
- **THEN** the wizard advances to step 2 (Agent Address)

---

### Requirement: Step 2 — Agent address input with URL pre-fill
The second step SHALL accept the agent wallet's EVM address. The address SHALL be
pre-filled from the `agent` URL search parameter if present (e.g., `/onboard?agent=0x1234...`).
If the URL parameter is present and the address is valid (42-character hex starting with `0x`),
the step SHALL auto-advance to step 3 without requiring user action.

If no URL parameter is present, the step SHALL display:
- A text input field with placeholder "0x..." and a paste-from-clipboard button
- Validation: reject non-hex, wrong length, or missing `0x` prefix
- A "Continue" button that is disabled until a valid address is entered

#### Scenario: Agent address from URL parameter
- **WHEN** user visits `/onboard?agent=0xAbC123...def` (valid 42-char hex)
- **THEN** the agent address field is pre-filled and the wizard auto-advances to step 3

#### Scenario: Invalid URL parameter
- **WHEN** user visits `/onboard?agent=not-an-address`
- **THEN** the URL parameter is ignored and the manual input is shown

#### Scenario: Manual address entry
- **WHEN** user pastes a valid address into the input field
- **THEN** the "Continue" button becomes enabled

#### Scenario: Paste from clipboard
- **WHEN** user clicks the paste button
- **THEN** the clipboard content is read and placed in the input field, validated immediately

---

### Requirement: Account existence detection
After both owner wallet and agent address are available, the page SHALL check if an
AA account already exists. Detection uses the factory's on-chain lookup:

1. Call `factory.getWalletByAgent(agentAddress)` — returns the account address or `address(0)`

If it returns a non-zero address, an account exists for this agent. The wizard SHALL
be replaced with an **account status card** (see separate requirement). If it returns
`address(0)`, the wizard continues normally.

The detection SHALL run automatically and SHALL show a loading indicator while checking.
If the RPC call fails, the wizard SHALL proceed as if no account exists (optimistic).

#### Scenario: Account already exists for this agent
- **WHEN** `getWalletByAgent(agentAddress)` returns a non-zero address
- **THEN** the wizard is replaced with the account status card

#### Scenario: No existing account for this agent
- **WHEN** `getWalletByAgent(agentAddress)` returns `address(0)`
- **THEN** the wizard continues to step 3 (Deploy & Fund Account)

#### Scenario: Detection RPC failure
- **WHEN** the factory lookup call fails
- **THEN** the wizard proceeds optimistically (assumes no account exists)

---

### Requirement: Account status card for already-setup accounts
When an existing AA account is detected, the page SHALL display a status card instead
of the wizard. The status card SHALL show:

- Account address (truncated with copy button)
- Owner address (read on-chain via `account.owner()`, truncated)
- Agent address (truncated)
- Account ETH balance (fetched on-chain)
- Agent wallet ETH balance (fetched on-chain)
- Deployment status badge (emerald "Active")
- Whether `agentSessionValidator` is set (fetched on-chain via `account.agentSessionValidator()`)
- Link to the main dashboard (`/`)
- Link to Etherscan for the account address

The status card SHALL match the dashboard's card design (`rounded-[28px]`, zinc borders,
shadow). If balance fetches fail, show "Unavailable" for those fields.

#### Scenario: Status card for funded account
- **WHEN** account exists and agent has ETH balance > 0
- **THEN** the status card shows the account address, both balances, and an "Active" badge

#### Scenario: Status card for unfunded agent
- **WHEN** account exists but agent wallet has 0 ETH
- **THEN** the status card shows "0 ETH" for agent balance and displays a "Fund agent" action button that sends a plain ETH transfer to the agent address

#### Scenario: Status card with missing agent validator
- **WHEN** account exists but `agentSessionValidator()` returns `address(0)`
- **THEN** the status card shows a warning "Agent validator not configured" (indicates the old contract version was used before the one-shot update)

#### Scenario: Status card balance fetch failure
- **WHEN** `getBalance` RPC calls fail
- **THEN** balances show "Unavailable" and the card is still rendered with all other data

---

### Requirement: Step 3 — Deploy & Fund account (single transaction)
The third step SHALL deploy an AA account AND fund the agent wallet for gas in a
single transaction by calling `AbstractAccountFactory.deployAccount()` with `msg.value`.

The factory function is a one-shot setup:
```solidity
function deployAccount(
    bytes32 salt,
    address policyHook,
    ModuleInit[] calldata modules,
    address agent,
    address agentSessionValidator
) external payable returns (address account)
```

The 5th parameter `agentSessionValidator` tells the factory which installed module
to wire up as the account's agent session validator. If non-zero, the factory
verifies the module is installed and calls `account.setAgentSessionValidator()`
internally. Pass `address(0)` to skip.

This single call:
- Deploys the `IsolatedAccount` via CREATE2
- Installs all modules (PolicyHookRuleSpend, WhitelistRequestModule, EmergencyControls, AgentSessionValidator)
- Calls `setAgentSessionValidator(agentSessionValidator)` on the account (if non-zero)
- Transfers ownership to `msg.sender`
- Forwards `msg.value` to the agent EOA for gas
- Registers agent and user in factory lookup mappings

**Salt**: Computed as `keccak256(toBytes("wallet-" + timestamp))` matching the
convention in `contracts/scripts/create-wallet-sepolia.ts`.

**Modules** (via `buildModuleInits` from `src/lib/contracts.ts`):
1. `PolicyHookRuleSpend` — init: `abi.encode(uint256(0))` (no native value cap)
2. `WhitelistRequestModule` — init: `0x` (empty)
3. `EmergencyControls` — init: `0x` (empty)
4. `AgentSessionValidator` — init: `abi.encode(agentAddress, uint48(0), uint48(0))` (no time bounds)

The step SHALL display:
- The funding amount (`0.005 ETH` to agent for gas)
- A "Deploy & Fund" button that initiates the wallet transaction with `value: parseEther("0.005")`
- Transaction state indicator: idle → confirming (wallet prompt) → pending (tx submitted, with Etherscan link) → confirmed
- Error state with message and "Retry" button

The step SHALL use wagmi `useWriteContract`. Contract addresses and ABIs are
imported from `src/lib/contracts.ts`.

#### Scenario: Successful deployment and funding
- **WHEN** user clicks "Deploy & Fund" and confirms the transaction in wallet
- **THEN** the account is deployed with all modules, agent receives 0.005 ETH, and the wizard advances to step 4 (Complete)

#### Scenario: User rejects wallet prompt
- **WHEN** user rejects the transaction in their wallet
- **THEN** the step shows an error "Transaction rejected" with a "Retry" button

#### Scenario: Transaction reverts — agent already has wallet
- **WHEN** the factory reverts with `AgentAlreadyHasWallet(agent, existingAccount)`
- **THEN** the step shows "This agent address already has an account" with the existing account address

#### Scenario: Transaction reverts — deployment failed
- **WHEN** the factory reverts with `DeploymentFailed` (e.g., CREATE2 salt collision)
- **THEN** the step shows the error with a "Retry" button (retry generates a new salt)

---

### Requirement: Step 4 — Completion summary
The final step SHALL display a success summary card with:
- Emerald success icon and "You're all set" heading
- Account address (with copy button and Etherscan link)
- Owner address (truncated)
- Agent address (truncated)
- Agent funded amount (0.005 ETH)
- Installed modules list (PolicyHookRuleSpend, WhitelistRequestModule, EmergencyControls, AgentSessionValidator)
- "Go to Dashboard" button linking to `/`

#### Scenario: Completion after deploy
- **WHEN** the deploy+fund transaction confirms
- **THEN** the summary card shows all details including the funded amount and a dashboard link

---

### Requirement: Contract settings file with build-time imports
All contract addresses, ABIs, and helpers SHALL be in `src/lib/contracts.ts`.
This file SHALL import at build time from the contracts directory:
- **Addresses**: from `contracts/deployments/sepolia.json` via `@deployments` alias
- **ABIs**: from `contracts/artifacts/` (Hardhat compiled output) via `@artifacts` alias

A `prebuild` / `predev` script in `frontend/package.json` SHALL run
`hardhat compile` in the contracts directory before each build or dev start,
ensuring artifacts are always fresh.

The file SHALL export:
- `DEPLOYMENTS` — record keyed by chain ID, built from imported deployment JSONs
- `NetworkDeployment` type — typed shape for per-network deployment data with `explorerUrl`
- `getDeployment(chainId)` — resolve deployment for a chain
- `FACTORY_ABI` — full ABI imported from `AbstractAccountFactory.json` artifact
- `ACCOUNT_ABI` — full ABI imported from `IsolatedAccount.json` artifact
- `buildModuleInits(agentAddress, deployment)` — returns the module init array
- `computeSalt(label?)` — returns `keccak256(toBytes(label ?? "wallet-" + Date.now()))`
- `DEFAULT_GAS_FUND_ETH` — `"0.005"`
- `txUrl(chainId, txHash)` and `addressUrl(chainId, address)` — explorer link helpers

Configuration required:
- `next.config.ts`: Turbopack `resolveAlias` for `@deployments` and `@artifacts`
- `tsconfig.json`: paths entries for `@deployments/*` and `@artifacts/*`
- `package.json`: `contracts:compile`, `predev`, `prebuild` scripts

#### Scenario: ABIs auto-update after contract change
- **WHEN** a contract's Solidity interface changes
- **AND** the dev server is restarted (which triggers `predev` → `hardhat compile`)
- **THEN** `FACTORY_ABI` and `ACCOUNT_ABI` reflect the new interface

#### Scenario: Addresses auto-update after redeploy
- **WHEN** contracts are redeployed and `contracts/deployments/sepolia.json` is updated
- **AND** the dev server is restarted
- **THEN** `getDeployment(11155111)` returns the new addresses

#### Scenario: Adding a new network
- **WHEN** a new deployment JSON is created (e.g., `base.json`)
- **THEN** adding an import and `DEPLOYMENTS` entry is the only change needed

---

### Requirement: Transaction status component
A reusable `<TxStatus>` component SHALL display transaction lifecycle states.
States: `idle` | `confirming` | `pending` | `confirmed` | `failed`.

Visual representation:
- `idle`: hidden or shows the action button
- `confirming`: amber spinner + "Waiting for wallet confirmation..."
- `pending`: amber spinner + "Transaction submitted" + Etherscan link to tx hash
- `confirmed`: emerald check + "Transaction confirmed" + Etherscan link
- `failed`: rose alert + error message + "Retry" button

The component SHALL accept `txHash`, `status`, `error`, `chainId`, and `onRetry` props.

#### Scenario: Transaction pending
- **WHEN** transaction is submitted but not yet confirmed
- **THEN** the component shows a spinner, the text "Transaction submitted", and an Etherscan link

#### Scenario: Transaction confirmed
- **WHEN** the transaction receipt is received
- **THEN** the component shows an emerald check, "Transaction confirmed", and an Etherscan link

#### Scenario: Transaction failed
- **WHEN** the transaction fails or is rejected
- **THEN** the component shows a rose error icon, the error message, and a "Retry" button

---

### Requirement: Responsive layout
The onboarding page SHALL be usable on screens 1024px and wider. The wizard content
SHALL be centered with a maximum width of `max-w-2xl`. The stepper SHALL be displayed
horizontally above the step content. On smaller screens, the stepper MAY collapse
to show only the current step number.

#### Scenario: Desktop viewport
- **WHEN** viewport is 1024px or wider
- **THEN** the full horizontal stepper and step content are visible

#### Scenario: Narrow viewport
- **WHEN** viewport is below 1024px
- **THEN** the layout remains usable with the stepper adapting or collapsing

---

### Requirement: Error boundary and network validation
The page SHALL validate that the connected wallet is on Sepolia (chain ID 11155111).
If the wallet is on a different network, the page SHALL display a "Switch to Sepolia"
prompt using wagmi's `useSwitchChain`. Contract interactions SHALL NOT proceed on
the wrong chain.

#### Scenario: Wrong network
- **WHEN** the connected wallet is on a chain other than Sepolia
- **THEN** a "Switch to Sepolia" prompt is displayed and wizard steps are disabled

#### Scenario: Network switch
- **WHEN** user switches to Sepolia via the prompt
- **THEN** the wizard becomes interactive

---

### Requirement: Trust boundaries
The onboarding page operates within these trust boundaries:

- **Owner wallet (trusted)**: The connected EOA is the sole authority for signing the deploy transaction. The page never holds or requests private keys.
- **Agent address (untrusted input)**: The agent address is user-provided (URL param or manual input). It is validated for format only (hex, length). No assumption is made about who controls it.
- **RPC provider (semi-trusted)**: On-chain reads may fail or return stale data. The page degrades gracefully on RPC errors.
- **Factory contract (trusted)**: Enforces one-wallet-per-agent invariant on-chain. The frontend trusts these checks but also validates client-side for better UX.
- **Contract addresses (from deployment JSON, trusted)**: All addresses sourced from `contracts/deployments/*.json` at build time. No user input influences which contracts are called.

#### Scenario: Malicious agent address
- **WHEN** a user provides an agent address they do not control
- **THEN** the AA account is still deployed correctly — the agent address has no special privileges until the owner configures policies. This is safe because the AA enforces policies on-chain regardless of who the agent is.

---

### Requirement: Playwright e2e test suite
The onboarding page SHALL have an automated end-to-end test suite using Playwright
that exercises the full onboarding flow against Sepolia. The tests use a funded
test mnemonic to derive an owner wallet and a random agent address per run.

Test infrastructure:
- Playwright installed as a devDependency in `frontend/`
- Config at `frontend/playwright.config.ts`
- Tests at `frontend/e2e/onboard.spec.ts`
- A test helper at `frontend/e2e/helpers/wallet.ts` that uses viem to derive
  an owner wallet from a mnemonic (`TEST_MNEMONIC` env var), sign transactions,
  and generate a fresh random agent address per test run
- The tests SHALL NOT use MetaMask or any browser wallet extension. Instead,
  they inject a wallet provider directly using viem's `privateKeyToAccount` +
  a custom wagmi connector, or interact with the page at the DOM level while
  a background viem `WalletClient` sends the actual on-chain transactions
- The dev server SHALL be started before tests (Playwright `webServer` config)

Test mnemonic is provided via `TEST_MNEMONIC` env var. It must have Sepolia ETH.
`TEST_RPC_URL` env var provides the Sepolia RPC endpoint (defaults to
`NEXT_PUBLIC_SEPOLIA_RPC_URL` from `.env`).

#### Scenario: Page renders and stepper is visible
- **GIVEN** the dev server is running
- **WHEN** Playwright navigates to `/onboard`
- **THEN** the page loads, the header is visible, the stepper shows 4 steps,
  and the "Connect your wallet" prompt is displayed

#### Scenario: Agent address pre-fill from URL parameter
- **GIVEN** a random agent address is generated
- **WHEN** Playwright navigates to `/onboard?agent=0x<random>`
- **THEN** the agent address field contains the address

#### Scenario: Full deploy+fund e2e flow
- **GIVEN** a fresh agent address (never used before) and a funded owner wallet
- **WHEN** the test:
  1. Navigates to `/onboard?agent=0x<freshAgent>`
  2. Connects the owner wallet (injected provider)
  3. Clicks "Continue" past install step
  4. Verifies agent address is pre-filled, auto-advances
  5. On the deploy step, sends `deployAccount` via a viem WalletClient
     (bypassing the browser wallet prompt) with the correct args
  6. Waits for the transaction to confirm
  7. Verifies the page advances to the success step
- **THEN** the success card shows the deployed account address, owner, agent,
  and funded amount

#### Scenario: Revisit shows status card
- **GIVEN** the full deploy flow completed for a given agent address
- **WHEN** the test navigates to `/onboard?agent=0x<sameAgent>`
- **THEN** the account status card is shown (not the wizard), displaying the
  account address, owner, and balances

#### Scenario: Invalid agent address shows validation error
- **WHEN** Playwright navigates to `/onboard?agent=not-an-address`
- **THEN** the manual input is shown (URL param ignored)
- **AND** entering "0xinvalid" shows a validation error
- **AND** the "Continue" button is disabled

#### Scenario: Agent already has wallet shows error
- **GIVEN** the agent address already has an account from a previous test run
- **WHEN** the test attempts to deploy with the same agent
- **THEN** the detection step shows the status card (account already exists)
