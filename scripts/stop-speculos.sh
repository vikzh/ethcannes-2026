#!/usr/bin/env bash
# Stop Speculos and the Ledger Live HTTP proxy.
#
# Usage:
#   scripts/stop-speculos.sh

set -euo pipefail

CONTAINER_NAME="speculos-eth"
PROXY_PID_FILE="/tmp/speculos-proxy.pid"

# Stop proxy
if [[ -f "$PROXY_PID_FILE" ]]; then
  PROXY_PID="$(cat "$PROXY_PID_FILE")"
  if kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "==> Stopping Ledger Live HTTP proxy (PID $PROXY_PID)..."
    kill "$PROXY_PID" 2>/dev/null || true
  fi
  rm -f "$PROXY_PID_FILE"
else
  # Try to find proxy by port
  PROXY_PID="$(lsof -ti :9998 2>/dev/null || true)"
  if [[ -n "$PROXY_PID" ]]; then
    echo "==> Stopping Ledger Live HTTP proxy (PID $PROXY_PID)..."
    kill "$PROXY_PID" 2>/dev/null || true
  fi
fi

# Stop container
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> Stopping Speculos container ($CONTAINER_NAME)..."
  docker rm -f "$CONTAINER_NAME" &>/dev/null
  echo "    Container removed."
else
  echo "No Speculos container found ($CONTAINER_NAME)."
fi

echo "Done."
