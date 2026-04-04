"use client";

import {
  ArrowLeftRight,
  BookOpen,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { type Address, formatUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Header } from "@/components/header";
import { AddRuleModal, type RulePrefill } from "@/components/add-rule-modal";
import { CreateAccountModal } from "@/components/create-account-modal";
import { SEPOLIA_TOKENS } from "@/lib/contracts";

interface AccountData {
  id: string;
  owner: string;
  policyHook: string;
  agentSessionValidator: string;
  deployedAtTimestamp?: string | null;
  deployedTxHash?: string | null;
}

interface RuleData {
  id: string;
  account: string;
  metadata: string;
  status: string;
  actionLabel: string;
  description: string;
  maxAmount: string;
  tokenLabel: string;
  tokenName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface PolicyRuleData {
  id: string;
  account: string;
  ruleId: string;
  target: string;
  selector: string;
  active: boolean;
  spendParamIndex: string;
  maxPerPeriod: string;
  periodDuration: string;
  addedAtTimestamp: string;
  addedTxHash: string;
  updatedAtTimestamp: string;
  updatedTxHash: string;
  actionLabel: string;
  tokenLabel: string;
}

interface AccountsResponse {
  accounts: AccountData[];
  whitelistRequests: RuleData[];
  policyRules: PolicyRuleData[];
}

interface AccountWithRules extends AccountData {
  rules: RuleData[];
  policyRules: PolicyRuleData[];
}

interface ChangelogEvent {
  type: "account_created" | "rule_created" | "rule_approved" | "rule_updated";
  title: string;
  description: string;
  timestamp: string;
  txHash: string | null;
  account?: string;
  target?: string;
  selector?: string;
}

async function fetchChangelog(
  owner: string,
): Promise<{ events: ChangelogEvent[] }> {
  const params = new URLSearchParams({ owner });
  const res = await fetch(`/api/changelog?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Unable to load changelog.");
  }
  return (await res.json()) as { events: ChangelogEvent[] };
}

const EVENT_STYLES: Record<ChangelogEvent["type"], { bg: string; text: string; label: string }> = {
  account_created: { bg: "bg-blue-50", text: "text-blue-700", label: "Created" },
  rule_created: { bg: "bg-amber-50", text: "text-amber-700", label: "Requested" },
  rule_approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Approved" },
  rule_updated: { bg: "bg-zinc-100", text: "text-zinc-700", label: "Updated" },
};

async function fetchAccountsByOwner(
  owner: string,
  chainId: number,
  options?: {
    first?: number;
    includeRules?: boolean;
  },
): Promise<AccountsResponse> {
  const params = new URLSearchParams({
    owner,
    chainId: String(chainId),
    first: String(options?.first ?? 1000),
    includeRules: String(options?.includeRules ?? true),
  });

  const res = await fetch(`/api/accounts?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Unable to load owner accounts.");
  }

  return (await res.json()) as AccountsResponse;
}

type NavKey =
  | "rules"
  | "changelog";

function formatDuration(seconds: string) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s === 0) return "No limit";
  if (s >= 86400 && s % 86400 === 0) return `${s / 86400} day${s / 86400 === 1 ? "" : "s"}`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600} hour${s / 3600 === 1 ? "" : "s"}`;
  if (s >= 60 && s % 60 === 0) return `${s / 60} minute${s / 60 === 1 ? "" : "s"}`;
  return `${s}s`;
}

function formatTokenAmount(rawAmount: string, target: string, fallbackLabel?: string) {
  if (rawAmount === "0") return "Unlimited";
  const token = SEPOLIA_TOKENS.find(
    (t) => t.address.toLowerCase() === target.toLowerCase(),
  );
  const decimals = token?.decimals ?? 18;
  const formatted = formatUnits(BigInt(rawAmount), decimals);
  const rawLabel = token?.symbol ?? fallbackLabel ?? "";
  const bracketMatch = rawLabel.match(/\(([^)]+)\)/);
  const symbol = bracketMatch ? bracketMatch[1] : rawLabel;
  return symbol ? `${formatted} ${symbol}` : formatted;
}

/** Try to extract an 0x address from a description string (e.g. "…to recipient 0xABC…") */
function extractRecipientAddress(description: string): string | undefined {
  const match = description.match(/(?:recipient|to)\s+(0x[0-9a-fA-F]{40})/i);
  return match?.[1];
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unavailable";
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp * 1000).toLocaleString();
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-zinc-100 font-medium text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
      {label}
    </button>
  );
}

export function DashboardApp() {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [activeNav, setActiveNav] = useState<NavKey>("rules");

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountChecked, setAccountChecked] = useState(false);
  const [homeAccounts, setHomeAccounts] = useState<AccountWithRules[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeReloadKey, setHomeReloadKey] = useState(0);
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEvent[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [addRuleAccount, setAddRuleAccount] = useState<AccountWithRules | null>(null);
  const [addRulePrefill, setAddRulePrefill] = useState<RulePrefill | undefined>(undefined);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const reloadRules = useCallback(() => setHomeReloadKey((k) => k + 1), []);
  const hasAccount = accountData !== null;
  const resetDisconnectedState = () => {
    setAccountData(null);
    setAccountLoading(false);
    setAccountChecked(false);
    setHomeAccounts([]);
    setHomeError(null);
    setHomeLoading(false);
  };
  const beginHomeLoad = () => {
    setHomeLoading(true);
    setHomeError(null);
  };
  const beginAccountLoad = () => {
    setAccountLoading(true);
  };

  useEffect(() => {
    if (!isConnected || !address || !chainId) {
      startTransition(resetDisconnectedState);
      return;
    }
    let cancelled = false;
    startTransition(beginAccountLoad);
    fetchAccountsByOwner(address, chainId, {
      first: 1,
      includeRules: false,
    })
      .then((response) => {
        if (!cancelled) {
          setAccountData(response.accounts[0] ?? null);
          setAccountLoading(false);
          setAccountChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccountData(null);
          setAccountLoading(false);
          setAccountChecked(true);
        }
      });
    return () => { cancelled = true; };
  }, [chainId, isConnected, address]);

  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      !chainId ||
      !hasAccount
    ) {
      return;
    }

    let cancelled = false;
    startTransition(beginHomeLoad);

    fetchAccountsByOwner(address, chainId)
      .then((response) => {
        if (!cancelled) {
          const rulesByAccount = new Map<string, RuleData[]>();

          for (const rule of response.whitelistRequests) {
            const key = rule.account.toLowerCase();
            const existing = rulesByAccount.get(key) ?? [];
            existing.push(rule);
            rulesByAccount.set(key, existing);
          }

          const policyRulesByAccount = new Map<string, PolicyRuleData[]>();

          for (const rule of response.policyRules) {
            const key = rule.account.toLowerCase();
            const existing = policyRulesByAccount.get(key) ?? [];
            existing.push(rule);
            policyRulesByAccount.set(key, existing);
          }

          const seen = new Set<string>();
          const uniqueAccounts = response.accounts.filter((account) => {
            const key = account.id.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const groupedAccounts = uniqueAccounts.map((account) => ({
            ...account,
            rules: rulesByAccount.get(account.id.toLowerCase()) ?? [],
            policyRules: policyRulesByAccount.get(account.id.toLowerCase()) ?? [],
          }));

          setHomeAccounts(groupedAccounts);
          setHomeLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHomeAccounts([]);
          setHomeError("Unable to load owner accounts from The Graph.");
          setHomeLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [address, chainId, hasAccount, homeReloadKey, isConnected]);

  useEffect(() => {
    if (!isConnected || !hasAccount || !accountData || activeNav !== "changelog") {
      return;
    }

    let cancelled = false;
    setChangelogLoading(true);
    setChangelogError(null);

    fetchChangelog(address!)
      .then((response) => {
        if (!cancelled) {
          setChangelogEntries(response.events);
          setChangelogLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChangelogEntries([]);
          setChangelogError("Unable to load changelog from The Graph.");
          setChangelogLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeNav, accountData, hasAccount, isConnected]);

  const router = useRouter();

  // Auto-redirect to /onboard when wallet is connected but no account exists
  useEffect(() => {
    if (isConnected && accountChecked && !hasAccount) {
      router.push("/onboard");
    }
  }, [isConnected, accountChecked, hasAccount, router]);

  const renderHomePanel = () => {
    if (homeLoading) {
      return (
        <div className="flex min-h-[420px] w-full items-center justify-center rounded-[28px] border border-zinc-200 bg-white/90 px-8 py-12 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-zinc-900" />
            Loading graph data for this owner address...
          </div>
        </div>
      );
    }

    if (homeError) {
      return (
        <div className="w-full max-w-3xl rounded-[28px] border border-rose-200 bg-rose-50/80 p-8 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 text-rose-600" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Graph data is unavailable
              </h2>
              <p className="mt-2 text-sm text-zinc-600">{homeError}</p>
              <button
                type="button"
                onClick={() => setHomeReloadKey((current) => current + 1)}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-4xl space-y-6">
        <div className="grid gap-4">
          {homeAccounts.length === 0 ? (
            <div className="rounded-[28px] border border-zinc-200 bg-white p-8 text-center shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                No accounts indexed for this owner
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                The connected wallet does not currently have any accounts in the
                subgraph for this owner address.
              </p>
            </div>
          ) : null}
          {homeAccounts.map((account, index) => (
            <article
              key={account.id}
              className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]"
            >
              <div className="border-b border-zinc-200 bg-[linear-gradient(135deg,_rgba(244,244,245,0.95),_rgba(255,255,255,1))] p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                      Account {index + 1}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <ShieldCheck className="h-4 w-4" />
                      {account.rules.length} approved rule{account.rules.length === 1 ? "" : "s"}
                    </div>
                    {account.policyRules.length > 0 && (
                      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                        <ShieldCheck className="h-4 w-4" />
                        {account.policyRules.length} polic{account.policyRules.length === 1 ? "y" : "ies"}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddRuleAccount(account)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Rule
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {account.rules.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {account.rules.map((rule) => (
                      <section
                        key={rule.id}
                        className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              {rule.status}
                            </div>
                            <h4 className="mt-3 text-base font-semibold text-zinc-950">
                              {rule.tokenLabel}
                            </h4>
                            <p className="mt-1 text-sm text-zinc-600">
                              {rule.actionLabel}
                            </p>
                          </div>
                          <div className="text-xs text-zinc-500">
                            Updated {formatTimestamp(rule.updatedAt)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              Token Name
                            </p>
                            <p className="mt-1 text-sm text-zinc-900">
                              {rule.tokenName}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              Description
                            </p>
                            <p className="mt-1 text-sm text-zinc-900">
                              {rule.description}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              Max Amount
                            </p>
                            <p className="mt-1 text-sm text-zinc-900">
                              {rule.maxAmount}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              Request Reason
                            </p>
                            <p className="mt-1 text-sm text-zinc-900">
                              {rule.metadata || "Approved whitelist rule"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              Created
                            </p>
                            <p className="mt-1 text-sm text-zinc-900">
                              {formatTimestamp(rule.createdAt)}
                            </p>
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {account.policyRules.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Policy Rules
                    </h3>
                    <div className="mt-3 space-y-3">
                      {account.policyRules.map((policy) => (
                        <section
                          key={policy.id}
                          className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${policy.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                                {policy.active ? "Active" : "Inactive"}
                              </div>
                              <h4 className="mt-3 text-base font-semibold text-zinc-950">
                                {policy.tokenLabel}
                              </h4>
                              <p className="mt-1 text-sm text-zinc-600">
                                {policy.actionLabel}
                              </p>
                            </div>
                            <div className="text-xs text-zinc-500">
                              Updated {formatTimestamp(policy.updatedAtTimestamp)}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                                Target
                              </p>
                              <p className="mt-1 truncate text-sm font-mono text-zinc-900">
                                {policy.target}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                                Max Per Period
                              </p>
                              <p className="mt-1 text-sm text-zinc-900">
                                {formatTokenAmount(policy.maxPerPeriod, policy.target, policy.tokenLabel)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                                Period Duration
                              </p>
                              <p className="mt-1 text-sm text-zinc-900">
                                {formatDuration(policy.periodDuration)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                                Added
                              </p>
                              <p className="mt-1 text-sm text-zinc-900">
                                {formatTimestamp(policy.addedAtTimestamp)}
                              </p>
                            </div>
                          </div>

                          {policy.addedTxHash && (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${policy.addedTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-block text-xs font-medium text-blue-600 underline decoration-blue-300 transition-colors hover:text-blue-800"
                            >
                              View on Etherscan
                            </a>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  };

  const handleGenerateRule = (event: ChangelogEvent) => {
    const account = event.account
      ? homeAccounts.find(
          (a) => a.id.toLowerCase() === event.account!.toLowerCase(),
        )
      : homeAccounts[0];
    if (!account) return;
    const destination = extractRecipientAddress(event.description);
    setAddRulePrefill({
      tokenAddress: event.target,
      destinationAddress: destination,
    });
    setAddRuleAccount(account);
  };

  const renderChangelogPanel = () => {
    if (changelogLoading) {
      return (
        <div className="flex min-h-[420px] w-full items-center justify-center rounded-[28px] border border-zinc-200 bg-white/90 px-8 py-12 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-zinc-900" />
            Loading changelog...
          </div>
        </div>
      );
    }

    if (changelogError) {
      return (
        <div className="w-full max-w-3xl rounded-[28px] border border-rose-200 bg-rose-50/80 p-8 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 text-rose-600" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Changelog unavailable
              </h2>
              <p className="mt-2 text-sm text-zinc-600">{changelogError}</p>
            </div>
          </div>
        </div>
      );
    }

    if (changelogEntries.length === 0) {
      return (
        <div className="w-full max-w-4xl rounded-[28px] border border-zinc-200 bg-white p-8 text-center shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
            No activity yet
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            No account or rule changes have been recorded.
          </p>
        </div>
      );
    }

    return (
      <div className="w-full max-w-4xl space-y-3">
        {changelogEntries.map((event, index) => {
          const style = EVENT_STYLES[event.type];
          return (
            <article
              key={`${event.timestamp}-${index}`}
              className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col items-center pt-0.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.bg}`}>
                  {event.type === "account_created" ? (
                    <ShieldCheck className={`h-4 w-4 ${style.text}`} />
                  ) : (
                    <ArrowLeftRight className={`h-4 w-4 ${style.text}`} />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-current/20 ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {event.title}
                    </h3>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-600">
                  {event.description}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    {event.txHash && (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-medium text-zinc-400 underline decoration-zinc-300 transition-colors hover:text-zinc-700"
                      >
                        View on Etherscan
                      </a>
                    )}
                  </div>
                  {event.type === "rule_created" && (
                    <button
                      type="button"
                      onClick={() => handleGenerateRule(event)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 transition-colors hover:bg-amber-200"
                    >
                      <Plus className="h-3 w-3" />
                      Generate rule
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <Header />
      <div className="flex min-h-0 flex-1">
        {hasAccount && isConnected && <aside className="flex w-[260px] shrink-0 flex-col border-r border-zinc-200 bg-white">
          <div className="p-3">
            <nav className="space-y-0.5">
              <NavItem
                icon={BookOpen}
                label="Rules"
                active={activeNav === "rules"}
                onClick={() => setActiveNav("rules")}
              />
              <NavItem
                icon={ArrowLeftRight}
                label="Change log"
                active={activeNav === "changelog"}
                onClick={() => setActiveNav("changelog")}
              />
            </nav>
            <div className="mt-4 px-3">
              <button
                type="button"
                onClick={() => setShowCreateAccount(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4 opacity-70" />
                New Account
              </button>
            </div>
          </div>
        </aside>}

        <div className="flex min-w-0 flex-1 flex-col">
          {!hasAccount && !accountLoading ? (
            <main className="flex flex-1 items-center px-10 pb-20 pt-[8vh]" style={{ justifyContent: "left", paddingLeft: "20%" }}>
              <div className="w-full max-w-md">
                <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900">
                  Create a dedicated wallet<br />
                  that lets your AI agent<br />
                  make only approved transactions
                </h1>
                <ul className="mt-6 space-y-2">
                  {[
                    "Approved destinations",
                    "Spending limits",
                    "Transaction frequency",
                    "Always allowed actions",
                    "One-time approvals",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-zinc-600">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    if (!isConnected && openConnectModal) {
                      openConnectModal();
                    } else {
                      router.push("/onboard");
                    }
                  }}
                  className="mt-8 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  {isConnected ? "Get started" : "Connect wallet"}
                </button>
              </div>
            </main>
          ) : accountLoading ? (
            <main className="flex flex-1 items-center justify-center px-10 pb-20 pt-[8vh]">
              <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm text-zinc-600 shadow-sm">
                <LoaderCircle className="h-4 w-4 animate-spin text-zinc-900" />
                Checking owner account on The Graph...
              </div>
            </main>
          ) : (
            <main className="flex-1 overflow-auto p-6">
              <div className="mx-auto flex min-h-full w-full max-w-5xl items-start justify-center">
                {activeNav === "rules" ? renderHomePanel() : null}
                {activeNav === "changelog" ? renderChangelogPanel() : null}
              </div>
            </main>
          )}
        </div>
      </div>

      {addRuleAccount && (
        <AddRuleModal
          accountAddress={addRuleAccount.id as Address}
          policyHookAddress={addRuleAccount.policyHook as Address}
          onClose={() => {
            setAddRuleAccount(null);
            setAddRulePrefill(undefined);
          }}
          onSuccess={reloadRules}
          prefill={addRulePrefill}
        />
      )}

      {showCreateAccount && (
        <CreateAccountModal
          onClose={() => setShowCreateAccount(false)}
          onSuccess={() => {
            setShowCreateAccount(false);
            reloadRules();
          }}
        />
      )}
    </div>
  );
}
