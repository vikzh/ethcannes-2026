# Frontend

Next.js 16 (Turbopack) dashboard and onboarding UI for agent wallets.

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Contract Artifacts

The frontend imports contract ABIs and deployment addresses from `../contracts/` via Turbopack resolve aliases (`@artifacts`, `@deployments`).

The required artifact JSON files are **committed to git** so that builds work without a local Hardhat installation (including on Vercel). If you recompile the contracts, commit the updated artifacts:

```bash
cd ../contracts
npx hardhat compile
git add artifacts/src/factory/AbstractAccountFactory.sol/AbstractAccountFactory.json
git add artifacts/src/accounts/IsolatedAccount.sol/IsolatedAccount.json
git commit -m "update contract artifacts"
```

Only the two ABI files used by the frontend are tracked; all other Hardhat outputs remain gitignored.
