/**
 * Query the deployed subgraph after on-chain steps (Sepolia e2e / agent scripts).
 *
 * Set one of:
 *   SUBGRAPH_QUERY_URL — full GraphQL HTTP endpoint (e.g. Studio query URL)
 *   GRAPH_API_KEY + GRAPH_SUBGRAPH_ID — The Graph decentralized gateway
 */

const SUBGRAPH_SNAPSHOT_QUERY = `
  query Snapshot($account: String!) {
    account(id: $account) {
      id
      owner
      policyHook
      agentSessionValidator
      deployedAtBlock
      updatedAtBlock
    }
    agentSession(id: $account) {
      id
      agentKey
      revoked
      validAfter
      validUntil
    }
    whitelistRequests(
      where: { account: $account }
      orderBy: requestId
      orderDirection: desc
      first: 20
    ) {
      id
      requestId
      status
      target
      selector
      metadata
    }
    whitelistEntries(where: { account: $account }, first: 30) {
      id
      target
      selector
      active
      updatedAtBlock
    }
    executionEnvelopes(
      where: { account: $account }
      orderBy: blockNumber
      orderDirection: desc
      first: 15
    ) {
      id
      nonce
      policyChecked
      callCount
      blockNumber
      signer
    }
    executionCalls(
      where: { account: $account }
      orderBy: blockNumber
      orderDirection: desc
      first: 10
    ) {
      id
      target
      selector
      nonce
      blockNumber
    }
  }
`;

function normalizeAccountId(addr: string): string {
  return addr.toLowerCase();
}

function resolveSubgraphUrl(): string | null {
  const direct = process.env.SUBGRAPH_QUERY_URL?.trim();
  if (direct) return direct;

  const apiKey = process.env.GRAPH_API_KEY?.trim();
  const subgraphId = process.env.GRAPH_SUBGRAPH_ID?.trim();
  if (apiKey && subgraphId) {
    return `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`;
  }
  return null;
}

export async function fetchSubgraphSnapshot(accountAddress: string): Promise<unknown> {
  const url = resolveSubgraphUrl();
  if (!url) {
    return { skipped: true, reason: "Set SUBGRAPH_QUERY_URL or GRAPH_API_KEY+GRAPH_SUBGRAPH_ID" };
  }

  const id = normalizeAccountId(accountAddress);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.GRAPH_API_KEY?.trim();
  if (apiKey && url.includes("gateway.thegraph.com")) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: SUBGRAPH_SNAPSHOT_QUERY,
      variables: { account: id },
    }),
  });

  const json = (await res.json()) as { data?: unknown; errors?: unknown };
  if (!res.ok) {
    return { error: true, status: res.status, body: json };
  }
  if (json.errors) {
    return { error: true, graphqlErrors: json.errors };
  }
  return json.data ?? {};
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function logSubgraphStep(stepLabel: string, accountAddress: string): Promise<void> {
  console.log(`\n--- Subgraph snapshot: ${stepLabel} ---`);
  try {
    const snap = await fetchSubgraphSnapshot(accountAddress);
    console.log(JSON.stringify(snap, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } catch (e) {
    console.log("Subgraph query failed:", e);
  }
}

export async function waitForSubgraphIndexingMs(): Promise<void> {
  const raw = process.env.SUBGRAPH_WAIT_MS?.trim();
  const ms = raw ? parseInt(raw, 10) : 8000;
  if (ms > 0) {
    console.log(`Waiting ${ms}ms for subgraph indexing...`);
    await sleep(ms);
  }
}
