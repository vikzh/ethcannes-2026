#!/usr/bin/env bash
# Build the Ledger Ethereum app ELF for Nano S+ using Docker.
#
# Usage:
#   scripts/build-eth-elf.sh          # build (skip if ELF exists)
#   scripts/build-eth-elf.sh --force  # rebuild even if ELF exists
#
# Requires: Docker Desktop running
# Output:   submodules/speculos/apps/nanosp-ethereum.elf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELF_OUTPUT="$PROJECT_ROOT/submodules/speculos/apps/nanosp-ethereum.elf"
APP_ETHEREUM_TAG="1.21.3"
DEV_TOOLS_IMAGE="ghcr.io/ledgerhq/ledger-app-builder/ledger-app-dev-tools:latest"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    -h|--help)
      echo "Usage: $0 [--force]"
      echo "Build Ledger Ethereum app ELF for Nano S+ (Speculos)"
      echo ""
      echo "Options:"
      echo "  --force   Rebuild even if ELF already exists"
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Check Docker
if ! docker info &>/dev/null; then
  echo "ERROR: Docker is required but not running."
  echo "Start Docker Desktop and try again."
  exit 1
fi

# Skip if exists
if [[ -f "$ELF_OUTPUT" && "$FORCE" == "false" ]]; then
  echo "ELF already exists at: $ELF_OUTPUT"
  echo "Use --force to rebuild."
  exit 0
fi

echo "==> Building Ledger Ethereum app ELF for Nano S+"
echo "    Tag: $APP_ETHEREUM_TAG"
echo "    Image: $DEV_TOOLS_IMAGE"
echo ""

# Clone into temp dir
TMPDIR_BUILD="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BUILD"' EXIT

echo "==> Cloning LedgerHQ/app-ethereum (tag $APP_ETHEREUM_TAG)..."
git clone --depth 1 --branch "$APP_ETHEREUM_TAG" \
  https://github.com/LedgerHQ/app-ethereum.git \
  "$TMPDIR_BUILD/app-ethereum" 2>&1

cd "$TMPDIR_BUILD/app-ethereum"
git submodule update --init 2>&1

echo ""
echo "==> Building ELF via Docker (this may take a few minutes on first run)..."
echo "    Pulling image if needed..."

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd -P):/app" \
  "$DEV_TOOLS_IMAGE" \
  bash -c 'export BOLOS_SDK=$NANOSP_SDK && make clean && make' 2>&1

# Check build output — Nano S+ SDK uses "nanos2" as the build dir name
ELF_BUILD_PATH="$(find "$TMPDIR_BUILD/app-ethereum/build" -name "app.elf" -path "*/bin/*" 2>/dev/null | head -1)"
if [[ -z "$ELF_BUILD_PATH" || ! -f "$ELF_BUILD_PATH" ]]; then
  echo "ERROR: Build did not produce an app.elf"
  echo "Checking build directory..."
  find "$TMPDIR_BUILD/app-ethereum/build" -name "*.elf" 2>/dev/null || echo "No .elf files found"
  exit 1
fi

# Copy to output
mkdir -p "$(dirname "$ELF_OUTPUT")"
cp "$ELF_BUILD_PATH" "$ELF_OUTPUT"

echo ""
echo "==> Success! ELF built and copied to:"
echo "    $ELF_OUTPUT"
echo ""
echo "    Size: $(du -h "$ELF_OUTPUT" | cut -f1)"
