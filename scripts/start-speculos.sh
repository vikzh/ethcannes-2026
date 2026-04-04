#!/usr/bin/env bash
# Start Speculos (Ledger emulator) with the Ethereum app for Nano S+.
#
# DEMO WORKFLOW:
#   1. Build the ELF (one-time):  scripts/build-eth-elf.sh
#   2. Start Speculos:            scripts/start-speculos.sh
#   3. Launch Ledger Live:        DEBUG_COMM_HTTP_PROXY=http://127.0.0.1:9998 open -a "Ledger Live"
#   4. Start frontend:            cd frontend && pnpm dev
#   5. Open browser:              http://localhost:3000/onboard
#   6. Click "Ledger" in connect modal, pair via WalletConnect in Ledger Live
#   7. View signing on Speculos:  http://127.0.0.1:5000 (web UI) or VNC 127.0.0.1:41000
#
# Usage:
#   scripts/start-speculos.sh [options]
#
# Options:
#   -d, --detach          Run in background
#   --seed "<mnemonic>"   Custom BIP39 seed (default: Speculos default)
#   --vnc-password <pw>   VNC password (required for macOS built-in VNC client)
#   --no-proxy            Don't start the Ledger Live HTTP proxy
#   --automation          Load auto-approval rules on startup
#
# Ports:
#   5000  - Speculos REST API + web UI
#   9998  - Ledger Live HTTP proxy (-> 9999)
#   9999  - APDU TCP server
#   41000 - VNC server

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELF_PATH="$PROJECT_ROOT/submodules/speculos/apps/nanosp-ethereum.elf"
APPS_DIR="$PROJECT_ROOT/submodules/speculos/apps"
PROXY_SCRIPT="$PROJECT_ROOT/submodules/speculos/tools/ledger-live-http-proxy.py"
PROXY_PID_FILE="/tmp/speculos-proxy.pid"
CONTAINER_NAME="speculos-eth"
SPECULOS_IMAGE="ghcr.io/ledgerhq/speculos"

DETACH=false
SEED=""
VNC_PASSWORD=""
NO_PROXY=false
LOAD_AUTOMATION=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--detach) DETACH=true; shift ;;
    --seed) SEED="$2"; shift 2 ;;
    --vnc-password) VNC_PASSWORD="$2"; shift 2 ;;
    --no-proxy) NO_PROXY=true; shift ;;
    --automation) LOAD_AUTOMATION=true; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# --- Pre-checks ---

if ! docker info &>/dev/null; then
  echo "ERROR: Docker is required but not running."
  exit 1
fi

if [[ ! -f "$ELF_PATH" ]]; then
  echo "ERROR: Ethereum app ELF not found at:"
  echo "  $ELF_PATH"
  echo ""
  echo "Build it first:  scripts/build-eth-elf.sh"
  exit 1
fi

# Stop existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> Stopping existing Speculos container..."
  docker rm -f "$CONTAINER_NAME" &>/dev/null || true
fi

# Kill existing proxy
if [[ -f "$PROXY_PID_FILE" ]]; then
  kill "$(cat "$PROXY_PID_FILE")" 2>/dev/null || true
  rm -f "$PROXY_PID_FILE"
fi

# --- Build Docker command ---

DOCKER_ARGS=(
  run --rm
  --name "$CONTAINER_NAME"
  -v "$APPS_DIR:/speculos/apps"
  -p "127.0.0.1:5000:5000"
  -p "127.0.0.1:9999:9999"
  -p "127.0.0.1:41000:41000"
)

SPECULOS_ARGS=(
  --model nanosp
  --display headless
  --apdu-port 9999
  --vnc-port 41000
  ./apps/nanosp-ethereum.elf
)

if [[ -n "$SEED" ]]; then
  echo "WARNING: Never use a seed phrase that controls real funds with Speculos."
  SPECULOS_ARGS+=(--seed "$SEED")
fi

if [[ -n "$VNC_PASSWORD" ]]; then
  SPECULOS_ARGS+=(--vnc-password "$VNC_PASSWORD")
fi

if [[ "$DETACH" == "true" ]]; then
  DOCKER_ARGS+=(-d)
fi

echo "==> Starting Speculos (Nano S+ with Ethereum app)..."
echo ""

# Start Speculos
docker "${DOCKER_ARGS[@]}" "$SPECULOS_IMAGE" "${SPECULOS_ARGS[@]}" &
SPECULOS_PID=$!

# Wait for Speculos API to be ready
echo "    Waiting for Speculos API..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5000/ &>/dev/null; then
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Speculos API did not start within 30 seconds."
    docker rm -f "$CONTAINER_NAME" &>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "    Speculos API ready."

# --- Start HTTP proxy ---

if [[ "$NO_PROXY" == "false" ]]; then
  if [[ ! -f "$PROXY_SCRIPT" ]]; then
    echo "WARNING: Proxy script not found at $PROXY_SCRIPT. Skipping proxy."
  elif ! command -v python3 &>/dev/null; then
    echo "WARNING: python3 not found. Skipping Ledger Live proxy."
  else
    echo "==> Starting Ledger Live HTTP proxy on port 9998..."
    python3 "$PROXY_SCRIPT" -p 9999 &
    PROXY_PID=$!
    echo "$PROXY_PID" > "$PROXY_PID_FILE"
    echo "    Proxy PID: $PROXY_PID (saved to $PROXY_PID_FILE)"
  fi
fi

# --- Load automation rules ---

if [[ "$LOAD_AUTOMATION" == "true" ]]; then
  AUTOMATION_FILE="$SCRIPT_DIR/speculos-automation.json"
  if [[ -f "$AUTOMATION_FILE" ]]; then
    echo "==> Loading automation rules..."
    curl -sf -d "@$AUTOMATION_FILE" http://127.0.0.1:5000/automation &>/dev/null && \
      echo "    Automation rules loaded (auto-approve enabled)." || \
      echo "    WARNING: Failed to load automation rules."
  else
    echo "    WARNING: Automation file not found at $AUTOMATION_FILE"
  fi
fi

# --- Print summary ---

echo ""
echo "============================================"
echo "  Speculos is running (Nano S+ / Ethereum)"
echo "============================================"
echo ""
echo "  Web UI:     http://127.0.0.1:5000"
echo "  VNC:        vnc://127.0.0.1:41000"
echo "  APDU:       127.0.0.1:9999"
if [[ "$NO_PROXY" == "false" ]]; then
echo "  LL Proxy:   http://127.0.0.1:9998"
fi
echo ""
echo "  Container:  $CONTAINER_NAME"
echo ""
echo "--- DEMO WORKFLOW ---"
echo ""
echo "  1. Launch Ledger Live with proxy:"
echo "     DEBUG_COMM_HTTP_PROXY=http://127.0.0.1:9998 open -a \"Ledger Live\""
echo ""
echo "  2. Start frontend dev server:"
echo "     cd frontend && pnpm dev"
echo ""
echo "  3. Open http://localhost:3000/onboard"
echo "     Click 'Ledger' in connect modal"
echo "     Pair with Ledger Live via WalletConnect"
echo ""
echo "  4. View Ledger signing at:"
echo "     http://127.0.0.1:5000 (web UI)"
echo ""
echo "  To stop: scripts/stop-speculos.sh"
echo ""

# If running in foreground, wait for container
if [[ "$DETACH" == "false" ]]; then
  echo "(Press Ctrl+C to stop)"
  wait "$SPECULOS_PID" 2>/dev/null || true
  # Cleanup proxy on exit
  if [[ -f "$PROXY_PID_FILE" ]]; then
    kill "$(cat "$PROXY_PID_FILE")" 2>/dev/null || true
    rm -f "$PROXY_PID_FILE"
  fi
fi
