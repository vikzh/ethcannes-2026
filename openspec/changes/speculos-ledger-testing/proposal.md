## Why

The onboarding flow requires MetaMask (or another browser wallet) on Sepolia to sign the `deployAccount` transaction. For the ETH Cannes 2026 demo, we want to show the full Ledger hardware wallet signing experience — including Clear Signing — without requiring a physical device. Speculos (Ledger's official emulator) can emulate a Nano S+ running the Ethereum app, and Ledger Live Desktop can be pointed at it via its debug HTTP proxy. This lets us demo the Ledger signing UX on-screen (VNC view of the emulated device) while using the existing RainbowKit `ledgerWallet` connector that already ships in the frontend.

## What Changes

- Add a `scripts/start-speculos.sh` helper that builds the Ethereum app ELF (via Ledger's Docker dev-tools image), starts Speculos in Docker with the ELF, and starts the HTTP proxy bridge for Ledger Live
- Add a `scripts/stop-speculos.sh` helper for cleanup
- Add a `docker-compose.speculos.yml` for reproducible Speculos + proxy startup
- Document the full demo workflow: Speculos → Ledger Live (debug proxy) → WalletConnect → RainbowKit → `deployAccount` with Clear Signing visible on VNC
- Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `.env.example` (required for the `ledgerWallet` connector to appear in RainbowKit)
- Add Speculos automation rules JSON for auto-approving transactions in headless/CI mode
- Store the built Ethereum app ELF in `submodules/speculos/apps/` for reuse (avoid rebuilding every time)

## Capabilities

### New Capabilities
- `speculos-ledger-testing`: Scripts, Docker Compose config, and documentation for running Speculos as a virtual Ledger device for demo and testing. Covers ELF building, Speculos startup, Ledger Live proxy bridge, VNC access, and automation rules for headless approval.

### Modified Capabilities
- `onboarding-page`: Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` requirement so the Ledger wallet option appears in the RainbowKit connect modal. Currently the env var is optional and undocumented — it needs to be set for Ledger to work.

## Impact

- **New files**: `scripts/start-speculos.sh`, `scripts/stop-speculos.sh`, `docker-compose.speculos.yml`, `scripts/speculos-automation.json`
- **Modified files**: `frontend/.env.example` (add WalletConnect project ID), `frontend/.env` (local dev)
- **Dependencies**: Docker Desktop must be running. First run pulls `ghcr.io/ledgerhq/speculos` and `ghcr.io/ledgerhq/ledger-app-builder/ledger-app-dev-tools:latest` images (~2-3 GB total)
- **No frontend code changes needed** — the existing `ledgerWallet` connector in `src/lib/wagmi.ts` works as-is once the WalletConnect project ID is set and Ledger Live is proxied to Speculos
- **Network**: Speculos emulates the Ledger device locally; all Sepolia transactions still go through the existing Alchemy RPC. The only new network traffic is between Ledger Live and the local HTTP proxy (127.0.0.1:9998 → 127.0.0.1:9999)
