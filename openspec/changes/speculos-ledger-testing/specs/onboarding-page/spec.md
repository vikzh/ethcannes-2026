## MODIFIED Requirements

### Requirement: Owner wallet connection gate
The onboarding wizard SHALL require the user to connect their owner wallet (EOA) via
RainbowKit before any wizard steps are actionable. If the wallet is not connected, the
page SHALL display a prominent "Connect wallet" prompt with the existing RainbowKit
connect button. The connected wallet address is the `owner` of the AA account.

The RainbowKit connect modal SHALL display the Ledger wallet option alongside MetaMask,
Coinbase, and WalletConnect. This requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to be
set to a valid WalletConnect Cloud project ID. The `.env.example` file SHALL document
this variable with instructions on obtaining a project ID from https://cloud.walletconnect.com.

#### Scenario: Wallet not connected
- **WHEN** user visits `/onboard` without a connected wallet
- **THEN** the wizard steps are visible but disabled/dimmed, and a "Connect your wallet to get started" prompt is displayed

#### Scenario: Wallet connected
- **WHEN** user connects their wallet via RainbowKit
- **THEN** the wizard steps become interactive and the connected address is displayed as the owner

#### Scenario: Wallet disconnected mid-flow
- **WHEN** user disconnects wallet while wizard is in progress
- **THEN** the wizard resets to the connection prompt state, preserving the agent address URL parameter

#### Scenario: Ledger wallet option visible
- **WHEN** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set to a valid project ID
- **THEN** the RainbowKit connect modal shows "Ledger" as a wallet option in the "Popular" group

#### Scenario: Ledger wallet option hidden
- **WHEN** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is not set or empty
- **THEN** the RainbowKit connect modal falls back to injected wallets only (no Ledger option)
