## 1. Ethereum App ELF Build

- [x] 1.1 Create `scripts/build-eth-elf.sh` — clone `LedgerHQ/app-ethereum` (pinned tag), build ELF via `ghcr.io/ledgerhq/ledger-app-builder/ledger-app-dev-tools:latest` Docker with `BOLOS_SDK=$NANOSP_SDK`, copy output to `submodules/speculos/apps/nanosp-ethereum.elf`. Include `--force` flag and skip-if-exists logic.
- [x] 1.2 Run `scripts/build-eth-elf.sh` and verify the ELF is produced at the expected path. Verify Docker pulls the dev-tools image successfully on ARM64.

## 2. Speculos Start/Stop Scripts

- [x] 2.1 Create `scripts/start-speculos.sh` — start Speculos Docker container (named `speculos-eth`) with ports 5000/9999/41000 exposed, `--model nanosp`, `--display headless`, configurable `--seed` and `--vnc-password`. Start the HTTP proxy (`submodules/speculos/tools/ledger-live-http-proxy.py`) on port 9998 as a background process, save PID to `/tmp/speculos-proxy.pid`. Print demo workflow instructions and derived Ethereum address on startup.
- [x] 2.2 Create `scripts/stop-speculos.sh` — stop and remove the `speculos-eth` Docker container, kill the proxy process via saved PID file.
- [x] 2.3 Test start/stop cycle: run start script, verify web UI at `http://127.0.0.1:5000`, verify APDU port responds, verify VNC port responds, run stop script, verify cleanup.

## 3. Automation Rules

- [x] 3.1 Create `scripts/speculos-automation.json` with rules matching Ledger Ethereum app screen texts ("Accept and send", "Accept", "Approve", "Sign", "Confirm") — each rule presses both buttons to confirm. Include rules for scrolling through transaction review screens (press right button on unmatched screens).
- [x] 3.2 Test automation: start Speculos, `POST /automation` with the rules JSON, send a test APDU (get-address), verify it auto-approves.

## 4. Docker Compose Configuration

- [x] 4.1 Create `docker-compose.speculos.yml` with a `speculos` service — image, volume mount for apps dir, ports, command with `--model nanosp`, `--display headless`. Support `SPECULOS_SEED` env var override.
- [x] 4.2 Test `docker compose -f docker-compose.speculos.yml up` and verify Speculos starts correctly.

## 5. Environment Configuration

- [x] 5.1 Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to `frontend/.env.example` with a comment explaining it's required for the Ledger wallet option and linking to https://cloud.walletconnect.com.
- [x] 5.2 Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `frontend/.env` for local development (obtain a project ID from WalletConnect Cloud or use an existing one).
- [x] 5.3 Verify the frontend shows the Ledger wallet option in the RainbowKit connect modal after setting the env var.

## 6. End-to-End Verification

- [ ] 6.1 (MANUAL) Full demo flow test: Start Speculos → start proxy → launch Ledger Live with `DEBUG_COMM_HTTP_PROXY` → start frontend dev server → connect via RainbowKit Ledger option → verify Ledger Live pairs → verify signing prompt appears on Speculos web UI.
- [ ] 6.2 (MANUAL) Fund the Speculos-derived Sepolia address with test ETH, attempt a `deployAccount` transaction through the full chain, verify it confirms on Sepolia.
