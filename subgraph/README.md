# Subgraph (Sepolia)

This subgraph indexes:

- account discovery from `AbstractAccountFactory.AccountDeployed`
- account ownership and execution history from `IsolatedAccount` events
- whitelist request lifecycle from `WhitelistRequestModule` events

## 1) Deploy contracts to Sepolia

From `contracts/`:

```bash
cp .env.example .env
# fill SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY
npm install
npm run deploy:sepolia
```

This writes `contracts/deployments/sepolia.json`.

## 2) Build subgraph config/code

From `subgraph/`:

```bash
npm install
npm run build:sepolia
```

That command:

1. reads `../contracts/deployments/sepolia.json`
2. generates `subgraph.yaml` from `subgraph.template.yaml`
3. runs `graph codegen`
4. runs `graph build`

## 3) Deploy to Graph Studio

```bash
graph auth --studio <DEPLOY_KEY>
graph deploy --studio <SUBGRAPH_SLUG>
```

## Useful queries

Accounts by owner:

```graphql
{
  accounts(where: { owner: "0x..." }) {
    id
    owner
    policyHook
    agentSessionValidator
    deployedAtBlock
  }
}
```

Pending whitelist requests:

```graphql
{
  whitelistRequests(where: { status: "Pending" }) {
    id
    account
    requestId
    target
    selector
    metadata
    createdAt
  }
}
```

Execution history:

```graphql
{
  executionEnvelopes(orderBy: blockNumber, orderDirection: desc, first: 20) {
    id
    account
    signer
    nonce
    mode
    callCount
    policyChecked
    txHash
  }
}
```
