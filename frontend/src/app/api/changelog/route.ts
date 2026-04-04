import { isAddress } from "viem";

const THEGRAPH_SUBGRAPH_URL =
  process.env.THEGRAPH_SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/ApzeUQepZLrJdxtipSY6nVJYPb62kjKNFv8orpBRLk1E";
const THEGRAPH_API_KEY =
  process.env.THEGRAPH_API_KEY ?? "68d40f402d446145454a9249c38bb491";

interface AccountRaw {
  id: string;
  owner: string;
  deployedAtTimestamp: string;
  deployedTxHash: string;
}

interface WhitelistRequestRaw {
  id: string;
  account: string;
  target: string;
  selector: string;
  metadata: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  createdTxHash: string | null;
  updatedTxHash: string | null;
}

interface GraphResponse {
  data?: {
    accounts?: AccountRaw[];
    whitelistRequests?: WhitelistRequestRaw[];
  };
  errors?: Array<{ message?: string }>;
}

function describeSelector(selector: string) {
  if (selector === "0x00000000") return "Native transfer";
  if (selector === "0xa9059cbb") return "ERC-20 transfer";
  return "Contract interaction";
}

export interface ChangelogEvent {
  type: "account_created" | "rule_created" | "rule_approved" | "rule_updated";
  title: string;
  description: string;
  timestamp: string;
  txHash: string | null;
  /** Structured fields for rule events (used for pre-filling "Add Rule" modal) */
  account?: string;
  target?: string;
  selector?: string;
}

function buildEvents(
  accounts: AccountRaw[],
  requests: WhitelistRequestRaw[],
): ChangelogEvent[] {
  const events: ChangelogEvent[] = [];

  for (const account of accounts) {
    events.push({
      type: "account_created",
      title: "Account created",
      description: `Smart account deployed for owner ${account.owner.slice(0, 6)}...${account.owner.slice(-4)}`,
      timestamp: account.deployedAtTimestamp,
      txHash: account.deployedTxHash,
    });
  }

  for (const req of requests) {
    const action = describeSelector(req.selector);
    const meta = req.metadata?.trim();

    // If createdAt and updatedAt differ, the rule was created then later approved
    const wasUpdated =
      req.createdAt && req.updatedAt && req.createdAt !== req.updatedAt;

    if (req.createdAt) {
      events.push({
        type: "rule_created",
        title: `Rule requested: ${action}`,
        description: meta || `Permission requested for ${action.toLowerCase()} to ${req.target.slice(0, 6)}...${req.target.slice(-4)}`,
        timestamp: req.createdAt,
        txHash: req.createdTxHash,
        account: req.account,
        target: req.target,
        selector: req.selector,
      });
    }

    if (wasUpdated && req.status === "Approved") {
      events.push({
        type: "rule_approved",
        title: `Rule approved: ${action}`,
        description: meta || `${action} to ${req.target.slice(0, 6)}...${req.target.slice(-4)} approved`,
        timestamp: req.updatedAt!,
        txHash: req.updatedTxHash,
      });
    } else if (!wasUpdated && req.status === "Approved" && req.createdAt) {
      // Created and approved at same time
      events[events.length - 1] = {
        type: "rule_approved",
        title: `Rule approved: ${action}`,
        description: meta || `${action} to ${req.target.slice(0, 6)}...${req.target.slice(-4)} approved`,
        timestamp: req.createdAt,
        txHash: req.createdTxHash,
      };
    }
  }

  // Sort newest first
  events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  return events;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  if (!owner || !isAddress(owner)) {
    return Response.json(
      { error: "A valid owner address is required." },
      { status: 400 },
    );
  }

  const normalizedOwner = owner.toLowerCase();

  const query = `{
    accounts(
      first: 100,
      where: { owner: "${normalizedOwner}" },
      orderBy: deployedAtTimestamp,
      orderDirection: desc
    ) {
      id
      owner
      deployedAtTimestamp
      deployedTxHash
    }
    whitelistRequests(
      first: 1000,
      orderBy: updatedAt,
      orderDirection: desc
    ) {
      id
      account
      target
      selector
      metadata
      status
      createdAt
      updatedAt
      createdTxHash
      updatedTxHash
    }
  }`;

  try {
    const graphResponse = await fetch(THEGRAPH_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${THEGRAPH_API_KEY}`,
      },
      cache: "no-store",
      body: JSON.stringify({ query }),
    });

    if (!graphResponse.ok) {
      return Response.json(
        { error: "The Graph request failed." },
        { status: 502 },
      );
    }

    const payload = (await graphResponse.json()) as GraphResponse;

    if (payload.errors?.length) {
      return Response.json(
        { error: payload.errors[0]?.message ?? "The Graph returned an error." },
        { status: 502 },
      );
    }

    const accounts = payload.data?.accounts ?? [];
    const accountIds = new Set(accounts.map((a) => a.id.toLowerCase()));

    // Filter whitelist requests to only those belonging to this owner's accounts
    const requests = (payload.data?.whitelistRequests ?? []).filter((r) =>
      accountIds.has(r.account.toLowerCase()),
    );

    const events = buildEvents(accounts, requests);

    return Response.json({ events });
  } catch {
    return Response.json(
      { error: "Unable to reach The Graph gateway." },
      { status: 502 },
    );
  }
}
