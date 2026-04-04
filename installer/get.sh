#!/usr/bin/env bash
# Agent Wallet Installer -- bootstrap script
# Usage: curl -fsSL https://raw.githubusercontent.com/vikzh/ethcannes-2026/main/installer/get.sh | bash
set -euo pipefail

REPO="vikzh/ethcannes-2026"
BRANCH="main"
INSTALL_DIR="${HOME}/.agent-wallet"
TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

info() { printf "\033[0;2m%s\033[0m\n" "$*" >&2; }
fail() { printf "\033[0;31m%s\033[0m\n" "$*" >&2; exit 1; }

# Preflight
command -v curl  >/dev/null 2>&1 || fail "curl is required"
command -v tar   >/dev/null 2>&1 || fail "tar is required"
command -v node  >/dev/null 2>&1 || fail "node is required -- install from https://nodejs.org"
[[ "$(uname -s)" == "Darwin" ]] || fail "macOS required"

info "Downloading installer..."
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

curl -fsSL "$TARBALL_URL" -o "${tmpdir}/archive.tar.gz"
tar -xzf "${tmpdir}/archive.tar.gz" -C "$tmpdir"

# GitHub tarballs extract to {repo}-{branch}/
extracted="${tmpdir}/ethcannes-2026-${BRANCH}"
[[ -d "${extracted}/installer" ]] || fail "Installer not found in archive"

# Copy installer to persistent location
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "${extracted}/installer/"* "$INSTALL_DIR/"
chmod +x "${INSTALL_DIR}/install.sh"

info "Installing dependencies..."
( cd "${INSTALL_DIR}/mcp-server" && npm install --silent 2>/dev/null )

info "Starting installer..."
printf "\n"
# When piped (curl | bash), stdin is the pipe -- reattach to terminal for interactive prompts
if [[ ! -t 0 ]] && [[ -e /dev/tty ]]; then
  exec bash "${INSTALL_DIR}/install.sh" "$@" </dev/tty
else
  exec bash "${INSTALL_DIR}/install.sh" "$@"
fi
