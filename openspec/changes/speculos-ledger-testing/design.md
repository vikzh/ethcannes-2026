## Context

The onboarding frontend at `/onboard` uses RainbowKit with wagmi to connect a browser wallet (owner EOA) and sign the `deployAccount` factory call on Sepolia. The `ledgerWallet` connector is already configured in `src/lib/wagmi.ts` but requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to be set — without it, the frontend falls back to injected wallets only.

The Speculos submodule is already checked out at `submodules/speculos/`. It emulates Ledger devices (Nano S+, Nano X, Stax, Flex) by running compiled `.elf` app binaries inside QEMU ARM. It exposes a REST API (port 5000), an APDU TCP server (port 9999), and optional VNC (port 41000).

The Ledger Ethereum app (`LedgerHQ/app-ethereum`) must be compiled into an ELF binary using Ledger's Docker dev-tools image. There are no prebuilt ELF binaries available.

Current system architecture: macOS ARM64, Docker Desktop available.

## Goals / Non-Goals

**Goals:**
- Provide a one-command setup to run Speculos with the Ethereum app for Nano S+
- Connect Ledger Live Desktop to the emulated device via the existing HTTP proxy bridge
- Enable the full RainbowKit → WalletConnect → Ledger Live → Speculos signing flow on Sepolia
- Allow the demo audience to see the emulated Ledger screen (transaction details, approval) via VNC or the Speculos web UI at port 5000
- Provide automation rules for headless/CI transaction approval
- Store the compiled ELF for reuse (avoid rebuilding each time)

**Non-Goals:**
- Custom Ledger plugin for Clear Signing of `deployAccount` (the factory call will show as a generic contract interaction; standard ETH transfers and ERC-20 calls get full Clear Signing automatically)
- Native (non-Docker) Speculos installation on macOS — QEMU cross-compilation on ARM64 macOS is fragile; Docker is the reliable path
- Replacing MetaMask for day-to-day development — this is specifically for demo and Ledger-focused testing
- Modifying any frontend React components or wagmi configuration beyond environment variables
- Supporting devices other than Nano S+ (single device target is sufficient for demo)

## Decisions

### 1. Docker-only Speculos (not native pip install)

Speculos requires `qemu-arm-static` and cross-compiled ARM libraries. On macOS ARM64, the native build path is unreliable (cmake cross-compilation issues). The official Docker image `ghcr.io/ledgerhq/speculos` bundles everything.

**Alternative considered**: `pip install speculos` — requires manually installing qemu-arm-static on macOS which is not straightforward on ARM64.

### 2. Separate Ethereum app build step using ledger-app-dev-tools

The ELF is built by cloning `LedgerHQ/app-ethereum` into a temp directory, then running `make` inside Ledger's Docker dev-tools container with `BOLOS_SDK=$NANOSP_SDK`. The resulting `build/nanosp/bin/app.elf` is copied to `submodules/speculos/apps/nanosp-ethereum.elf`.

This is a one-time build. The ELF is gitignored but persists locally across Speculos restarts.

**Alternative considered**: Including a pre-built ELF in the repo — rejected because ELF binaries are ~300KB+ and tied to specific SDK versions; better to build fresh.

### 3. Ledger Live HTTP proxy bridge (not direct transport replacement)

The existing `tools/ledger-live-http-proxy.py` in the Speculos repo bridges Ledger Live to Speculos by proxying APDUs over HTTP on port 9998 → TCP port 9999. Ledger Live reads the `DEBUG_COMM_HTTP_PROXY` env var to route device communication through this proxy.

This preserves the full WalletConnect flow: RainbowKit shows QR → Ledger Live scans → Ledger Live routes signing to Speculos → Speculos emulates approval.

**Alternative considered**: Custom wagmi connector that speaks APDU directly to Speculos — far more code, bypasses Ledger Live UX entirely, defeats the demo purpose.

### 4. VNC + web UI for demo visibility

Speculos exposes both a VNC server (port 41000) and a web UI at `http://127.0.0.1:5000`. During the demo, either can be used to show the audience the emulated Ledger screen. VNC is better for screen capture; the web UI works in any browser.

### 5. Seed phrase strategy

Use a known test mnemonic for the emulated Ledger. The Speculos default seed is fine for demo purposes. The derived Ethereum address from this seed must be funded with Sepolia ETH. The seed is passed via `--seed` flag to Speculos.

### 6. docker-compose.speculos.yml for orchestration

A dedicated compose file (not merged into a main docker-compose.yml) keeps Speculos isolated. It runs two services:
1. `speculos` — the emulated device (ports 5000, 9999, 41000)
2. `proxy` — the HTTP proxy bridge (port 9998 → speculos:9999)

The proxy is a lightweight Python script; it can run either in Docker or natively. For simplicity, run it natively on the host since Python 3 is already available on macOS.

## Risks / Trade-offs

**[Risk] Ledger Live may not support DEBUG_COMM_HTTP_PROXY in recent versions** → Mitigation: This is a documented debug feature. If removed, fall back to using `ledgerctl` or `ledgerblue` CLI tools to bridge, or use the Speculos web UI for a direct demo without the full Ledger Live chain.

**[Risk] ELF build may fail due to SDK version changes** → Mitigation: Pin the app-ethereum repo to a known-good tag/commit in the build script.

**[Risk] WalletConnect pairing latency adds demo friction** → Mitigation: Pre-pair Ledger Live with the dApp before the demo starts. WalletConnect sessions persist.

**[Risk] Speculos Ethereum app shows `deployAccount` as blind sign (raw data)** → Mitigation: This is expected for custom contract calls. Standard ETH transfers and ERC-20 approvals get full Clear Signing. For the demo, acknowledge this is a custom call and show the transaction details on the web UI.

**[Trade-off] Docker image pull is ~2-3 GB total (speculos + dev-tools)** → Acceptable for one-time setup. Document this in the script output.

**[Trade-off] Speculos web UI at port 5000 is HTTP-only** → Fine for localhost demo use. Do not expose publicly.
