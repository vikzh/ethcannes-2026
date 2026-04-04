import {
  createPublicClient,
  hexToString,
  http,
  isAddress,
  type Address,
  type Chain,
} from "viem";
import { sepolia } from "viem/chains";

const THEGRAPH_SUBGRAPH_URL =
  process.env.THEGRAPH_SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/ApzeUQepZLrJdxtipSY6nVJYPb62kjKNFv8orpBRLk1E";
const THEGRAPH_API_KEY =
  process.env.THEGRAPH_API_KEY ?? "68d40f402d446145454a9249c38bb491";
const SERVER_RPC_URLS: Partial<Record<number, string>> = {
  [sepolia.id]: process.env.SEPOLIA_RPC_URL?.trim() ?? "",
};
const tokenMetadataCache = new Map<string, string>();
const KNOWN_TOKEN_LABELS: Record<number, Record<string, string>> = {
  [sepolia.id]: {
    "0xf29934cc706e20dda4ba265fde0d69c2e35e3988": "Mock Token (MOCK)",
  },
};
const MAX_AMOUNT_NOT_INDEXED = "-";

const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC20_METADATA_BYTES32_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface AccountData {
  id: string;
  owner: string;
  policyHook: string;
  agentSessionValidator: string;
  deployedAtTimestamp?: string | null;
  deployedTxHash?: string | null;
}

interface WhitelistRequest {
  id: string;
  account: string;
  requestId: string;
  target: string;
  selector: string;
  metadata: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface EnrichedWhitelistRequest extends WhitelistRequest {
  actionLabel: string;
  description: string;
  maxAmount: string;
  tokenLabel: string;
  tokenName: string;
}

interface TheGraphResponse {
  data?: {
    accounts?: AccountData[];
    whitelistRequests?: WhitelistRequest[];
  };
  errors?: Array<{
    message?: string;
  }>;
}

function parseBoolean(value: string | null, defaultValue: boolean) {
  if (value == null) return defaultValue;
  return value === "true";
}

function describeSelector(selector: string) {
  if (selector === "0x00000000") return "Native transfer";
  if (selector === "0xa9059cbb") return "ERC-20 transfer(address,uint256)";
  return "Contract interaction";
}

function buildDescription(actionLabel: string, tokenLabel: string) {
  if (actionLabel === "Native transfer") {
    return `Allow native transfer in ${tokenLabel}`;
  }

  return `Allow ${actionLabel} on ${tokenLabel}`;
}

function decodeBytes32String(value: `0x${string}`) {
  return hexToString(value, { size: 32 }).replace(/\0+$/g, "").trim();
}

function buildTokenLabel(name: string | null, symbol: string | null) {
  const trimmedName = name?.trim() ?? "";
  const trimmedSymbol = symbol?.trim() ?? "";

  if (trimmedName && trimmedSymbol) {
    return `${trimmedName} (${trimmedSymbol})`;
  }

  if (trimmedName) return trimmedName;
  if (trimmedSymbol) return trimmedSymbol;
  return null;
}

function resolveRpcUrl(chain: Chain) {
  return (
    SERVER_RPC_URLS[chain.id] ||
    chain.rpcUrls.default.http[0] ||
    chain.rpcUrls.public?.http[0] ||
    ""
  );
}

async function readTokenLabel(
  publicClient: ReturnType<typeof createPublicClient>,
  target: Address,
) {
  let name: string | null = null;
  let symbol: string | null = null;

  try {
    const result = await publicClient.readContract({
      address: target,
      abi: ERC20_METADATA_ABI,
      functionName: "name",
    });

    if (typeof result === "string" && result.trim().length > 0) {
      name = result;
    }
  } catch {
    // ignore and continue
  }

  try {
    const result = await publicClient.readContract({
      address: target,
      abi: ERC20_METADATA_ABI,
      functionName: "symbol",
    });

    if (typeof result === "string" && result.trim().length > 0) {
      symbol = result;
    }
  } catch {
    // ignore and continue
  }

  const stringLabel = buildTokenLabel(name, symbol);
  if (stringLabel) return stringLabel;

  let bytes32Name: string | null = null;
  let bytes32Symbol: string | null = null;

  try {
    const result = await publicClient.readContract({
      address: target,
      abi: ERC20_METADATA_BYTES32_ABI,
      functionName: "name",
    });
    const decodedName = decodeBytes32String(result);

    if (decodedName.length > 0) {
      bytes32Name = decodedName;
    }
  } catch {
    // ignore and continue
  }

  try {
    const result = await publicClient.readContract({
      address: target,
      abi: ERC20_METADATA_BYTES32_ABI,
      functionName: "symbol",
    });
    const decodedSymbol = decodeBytes32String(result);

    if (decodedSymbol.length > 0) {
      bytes32Symbol = decodedSymbol;
    }
  } catch {
    // ignore
  }

  return buildTokenLabel(bytes32Name, bytes32Symbol);
}

async function enrichRulesWithTokenMetadata(
  rules: WhitelistRequest[],
  chain: Chain,
) {
  const rpcUrl = resolveRpcUrl(chain);
  const nativeTokenName = chain.nativeCurrency.name;
  const knownTokenLabels = KNOWN_TOKEN_LABELS[chain.id] ?? {};

  if (!rpcUrl) {
    return rules.map<EnrichedWhitelistRequest>((rule) => ({
      ...rule,
      actionLabel: describeSelector(rule.selector),
      tokenLabel:
        rule.selector === "0x00000000"
          ? nativeTokenName
          : knownTokenLabels[rule.target.toLowerCase()] ?? "ERC-20 token",
      tokenName:
        rule.selector === "0x00000000"
          ? nativeTokenName
          : knownTokenLabels[rule.target.toLowerCase()] ?? "ERC-20 token",
      description: buildDescription(
        describeSelector(rule.selector),
        rule.selector === "0x00000000"
          ? nativeTokenName
          : knownTokenLabels[rule.target.toLowerCase()] ?? "ERC-20 token",
      ),
      maxAmount: MAX_AMOUNT_NOT_INDEXED,
    }));
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 5_000 }),
  });
  const tokenNames = new Map<string, string>();

  const uniqueTargets = [
    ...new Set(
      rules
        .filter(
          (rule) =>
            rule.selector !== "0x00000000" &&
            isAddress(rule.target),
        )
        .map((rule) => rule.target.toLowerCase()),
    ),
  ];

  await Promise.all(
    uniqueTargets.map(async (target) => {
      const cachedTokenName = tokenMetadataCache.get(`${chain.id}:${target}`);

      if (cachedTokenName) {
        tokenNames.set(target, cachedTokenName);
        return;
      }

      const tokenName = await readTokenLabel(publicClient, target as Address);
      const resolvedTokenName =
        knownTokenLabels[target] ?? tokenName ?? "ERC-20 token";
      tokenNames.set(target, resolvedTokenName);
      tokenMetadataCache.set(`${chain.id}:${target}`, resolvedTokenName);
    }),
  );

  return rules.map<EnrichedWhitelistRequest>((rule) => {
    const tokenLabel =
      rule.selector === "0x00000000"
        ? nativeTokenName
        : tokenNames.get(rule.target.toLowerCase()) ??
          knownTokenLabels[rule.target.toLowerCase()] ??
          "ERC-20 token";
    const actionLabel = describeSelector(rule.selector);

    return {
      ...rule,
      actionLabel,
      description: buildDescription(actionLabel, tokenLabel),
      maxAmount: MAX_AMOUNT_NOT_INDEXED,
      tokenLabel,
      tokenName: tokenLabel,
    };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const firstRaw = Number(searchParams.get("first") ?? "5");
  const includeRules = parseBoolean(searchParams.get("includeRules"), true);

  if (!owner || !isAddress(owner)) {
    return Response.json(
      { error: "A valid owner address is required." },
      { status: 400 },
    );
  }

  // Always use Sepolia for RPC token metadata enrichment
  const chain = sepolia;

  const first = Number.isFinite(firstRaw)
    ? Math.min(Math.max(Math.trunc(firstRaw), 1), 1000)
    : 5;
  const normalizedOwner = owner.toLowerCase();
  const query = includeRules
    ? `{
        accounts(
          first: ${first},
          where: { owner: "${normalizedOwner}" },
          orderBy: id,
          orderDirection: asc
        ) {
          id
          owner
          policyHook
          agentSessionValidator
          deployedAtTimestamp
          deployedTxHash
        }
        whitelistRequests(
          first: 1000,
          where: { status: "Approved" },
          orderBy: updatedAt,
          orderDirection: asc
        ) {
          id
          account
          requestId
          target
          selector
          metadata
          status
          createdAt
          updatedAt
        }
      }`
    : `{
        accounts(
          first: ${first},
          where: { owner: "${normalizedOwner}" },
          orderBy: id,
          orderDirection: asc
        ) {
          id
          owner
          policyHook
          agentSessionValidator
          deployedAtTimestamp
          deployedTxHash
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

    const payload = (await graphResponse.json()) as TheGraphResponse;

    if (payload.errors?.length) {
      return Response.json(
        { error: payload.errors[0]?.message ?? "The Graph returned an error." },
        { status: 502 },
      );
    }

    const accounts = payload.data?.accounts ?? [];

    if (!includeRules) {
      return Response.json({
        accounts,
        whitelistRequests: [],
      });
    }

    const accountIds = new Set(accounts.map((account) => account.id.toLowerCase()));
    const whitelistRequests = (payload.data?.whitelistRequests ?? []).filter(
      (rule) => accountIds.has(rule.account.toLowerCase()),
    );
    const enrichedRules = await enrichRulesWithTokenMetadata(
      whitelistRequests,
      chain,
    );

    return Response.json({
      accounts,
      whitelistRequests: enrichedRules,
    });
  } catch {
    return Response.json(
      { error: "Unable to reach The Graph gateway." },
      { status: 502 },
    );
  }
}
