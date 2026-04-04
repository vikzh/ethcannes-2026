# ethcannes-2026

## Agent Wallet Installer

Set up an on-chain agent wallet with DeFi capabilities (Uniswap, Aave, ERC-20) on Base. The installer creates an OWS wallet, configures chain policies, and registers an MCP server with your AI coding agents (OpenClaw, Claude Code/Cowork, Codex).

```bash
curl -fsSL https://raw.githubusercontent.com/vikzh/ethcannes-2026/main/installer/get.sh | bash
```

Or from a local clone:

```bash
./installer/install.sh
```

Requirements: macOS, Node.js. OWS is installed automatically if missing.

After install, your agent has access to 20 MCP tools for swapping, lending, token transfers, and arbitrary contract interaction -- all signed through the local OWS wallet.

See [`installer/README.md`](./installer/README.md) for full documentation.

## Frontend

The Next.js app lives in [`frontend/`](./frontend/). From that directory:

```bash
cd frontend
npm install
npm run dev
```

See `frontend/README.md` for app-specific details.