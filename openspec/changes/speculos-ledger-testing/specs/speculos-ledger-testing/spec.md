## ADDED Requirements

### Requirement: Ethereum app ELF build script
The project SHALL include a script `scripts/build-eth-elf.sh` that compiles the Ledger Ethereum app into an ELF binary for Nano S+. The script SHALL clone `LedgerHQ/app-ethereum` (pinned to a known-good commit/tag) into a temporary directory, run `make` inside the `ghcr.io/ledgerhq/ledger-app-builder/ledger-app-dev-tools:latest` Docker container with `BOLOS_SDK=$NANOSP_SDK`, and copy the resulting ELF to `submodules/speculos/apps/nanosp-ethereum.elf`. The script SHALL skip the build if the ELF already exists (pass `--force` to rebuild). The script SHALL require Docker to be running.

#### Scenario: First-time ELF build
- **WHEN** `scripts/build-eth-elf.sh` is run and `submodules/speculos/apps/nanosp-ethereum.elf` does not exist
- **THEN** the script clones app-ethereum, builds the ELF via Docker, copies it to `submodules/speculos/apps/nanosp-ethereum.elf`, and prints the output path

#### Scenario: ELF already exists
- **WHEN** `scripts/build-eth-elf.sh` is run and the ELF already exists
- **THEN** the script prints "ELF already exists, use --force to rebuild" and exits 0

#### Scenario: Force rebuild
- **WHEN** `scripts/build-eth-elf.sh --force` is run
- **THEN** the script rebuilds the ELF regardless of whether it already exists

#### Scenario: Docker not running
- **WHEN** Docker daemon is not available
- **THEN** the script prints an error "Docker is required but not running" and exits 1

---

### Requirement: Speculos start script
The project SHALL include a script `scripts/start-speculos.sh` that starts Speculos in Docker with the Ethereum app ELF. The script SHALL:
1. Verify the ELF exists at `submodules/speculos/apps/nanosp-ethereum.elf` (print error if missing, suggest running `build-eth-elf.sh`)
2. Start Speculos via `docker run` with `--model nanosp`, `--display headless`, ports 5000 (API/web UI), 9999 (APDU), and 41000 (VNC) exposed
3. Accept an optional `--seed "<mnemonic>"` argument (default: Speculos default seed)
4. Accept an optional `--vnc-password` argument for macOS VNC client compatibility
5. Run in foreground by default, or in background with `--detach`/`-d`
6. Print the URLs for web UI, VNC, and APDU server on startup

#### Scenario: Start Speculos with defaults
- **WHEN** `scripts/start-speculos.sh` is run with the ELF present
- **THEN** Speculos starts in Docker, the web UI is accessible at `http://127.0.0.1:5000`, VNC at port 41000, and APDU at port 9999

#### Scenario: Start Speculos in background
- **WHEN** `scripts/start-speculos.sh -d` is run
- **THEN** Speculos starts in the background and the container ID is printed

#### Scenario: Start with custom seed
- **WHEN** `scripts/start-speculos.sh --seed "test test test test test test test test test test test junk"` is run
- **THEN** Speculos uses the provided mnemonic for key derivation

#### Scenario: ELF missing
- **WHEN** `scripts/start-speculos.sh` is run without the ELF present
- **THEN** the script prints "Ethereum app ELF not found. Run: scripts/build-eth-elf.sh" and exits 1

---

### Requirement: Speculos stop script
The project SHALL include a script `scripts/stop-speculos.sh` that stops and removes the Speculos Docker container. The script SHALL identify the container by name (`speculos-eth`).

#### Scenario: Stop running Speculos
- **WHEN** `scripts/stop-speculos.sh` is run with Speculos running
- **THEN** the container is stopped and removed

#### Scenario: Speculos not running
- **WHEN** `scripts/stop-speculos.sh` is run with no Speculos container
- **THEN** the script prints "No Speculos container found" and exits 0

---

### Requirement: Ledger Live HTTP proxy start
The start script SHALL also start the Ledger Live HTTP proxy bridge (`submodules/speculos/tools/ledger-live-http-proxy.py`) on port 9998. The proxy SHALL forward APDUs from Ledger Live to the Speculos APDU server on port 9999. The proxy SHALL be started as a background process and its PID SHALL be saved for cleanup.

#### Scenario: Proxy starts with Speculos
- **WHEN** `scripts/start-speculos.sh` is run
- **THEN** the HTTP proxy is running on `http://127.0.0.1:9998` and forwarding to Speculos port 9999

#### Scenario: Proxy cleanup on stop
- **WHEN** `scripts/stop-speculos.sh` is run
- **THEN** the HTTP proxy process is also killed using the saved PID

---

### Requirement: Speculos automation rules for headless approval
The project SHALL include a JSON file `scripts/speculos-automation.json` with Speculos automation rules that auto-approve Ethereum transactions. The rules SHALL match common Ledger Ethereum app screen texts including "Accept", "Approve", "Sign", and "Confirm" and press both buttons to confirm. The rules SHALL be loadable via Speculos `POST /automation` REST API endpoint.

#### Scenario: Load automation rules
- **WHEN** `curl -d @scripts/speculos-automation.json http://127.0.0.1:5000/automation` is run
- **THEN** Speculos auto-approves subsequent transaction signing prompts

#### Scenario: Auto-approve deployAccount transaction
- **WHEN** automation rules are loaded and a `deployAccount` transaction is sent via Ledger Live
- **THEN** Speculos automatically navigates through all review screens and approves the transaction without manual interaction

---

### Requirement: Docker Compose configuration
The project SHALL include a `docker-compose.speculos.yml` file that defines a `speculos` service with:
- Image: `ghcr.io/ledgerhq/speculos`
- Volume mount: `./submodules/speculos/apps:/speculos/apps`
- Ports: 5000, 9999, 41000
- Command: `--model nanosp ./apps/nanosp-ethereum.elf --display headless --apdu-port 9999 --vnc-port 41000`
- Configurable seed via environment variable `SPECULOS_SEED`

The compose file SHALL allow starting Speculos with `docker compose -f docker-compose.speculos.yml up`.

#### Scenario: Start via Docker Compose
- **WHEN** `docker compose -f docker-compose.speculos.yml up` is run
- **THEN** Speculos starts with the Ethereum app and all ports are accessible

#### Scenario: Custom seed via environment
- **WHEN** `SPECULOS_SEED="custom mnemonic" docker compose -f docker-compose.speculos.yml up` is run
- **THEN** Speculos uses the custom mnemonic

---

### Requirement: Demo workflow documentation
The project SHALL include clear documentation (in a comment block at the top of `scripts/start-speculos.sh` and as stdout output when the script runs) explaining the full demo flow:
1. Start Speculos (`scripts/start-speculos.sh`)
2. Launch Ledger Live with proxy: `DEBUG_COMM_HTTP_PROXY=http://127.0.0.1:9998 open -a "Ledger Live"`
3. Open the frontend (`http://localhost:3000/onboard`)
4. Click "Ledger" in the RainbowKit connect modal
5. Pair with Ledger Live via WalletConnect
6. Execute `deployAccount` — view signing on Speculos web UI (port 5000) or VNC (port 41000)

#### Scenario: Script prints demo instructions
- **WHEN** `scripts/start-speculos.sh` finishes starting Speculos
- **THEN** the script prints the step-by-step demo workflow to stdout

---

### Requirement: Derived Ethereum address output
The start script SHALL derive and print the Ethereum address from the configured seed phrase so the user knows which address to fund with Sepolia ETH. This SHALL be done by querying the Speculos API (`GET /events` or `POST /apdu` with the Ethereum app's get-address APDU) after startup, or by computing it locally from the BIP-44 derivation path `m/44'/60'/0'/0/0`.

#### Scenario: Address printed on startup
- **WHEN** Speculos starts successfully
- **THEN** the script prints "Ledger address: 0x..." derived from the seed at the standard Ethereum derivation path

---

### Requirement: Trust boundaries
- **Speculos (untrusted for production)**: Speculos is explicitly NOT a secure execution environment. Apps can make arbitrary syscalls through QEMU. It SHALL only be used for testing and demos, never with real funds.
- **Seed phrase (test-only)**: The seed used in Speculos SHALL be a test mnemonic with no real value. Scripts SHALL print a warning if a custom seed is provided.
- **Network isolation**: Speculos and the proxy run on localhost only. No ports SHALL be bound to `0.0.0.0`.
- **Docker**: The Docker containers run with default isolation. No `--privileged` flag SHALL be used for Speculos.

#### Scenario: Security warning on custom seed
- **WHEN** `scripts/start-speculos.sh --seed "..."` is run with a custom seed
- **THEN** the script prints a warning: "WARNING: Never use a seed phrase that controls real funds with Speculos"
