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
import type { Address } from "viem";
import { Header } from "@/components/header";
import { AddRuleModal } from "@/components/add-rule-modal";

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

interface AccountsResponse {
  accounts: AccountData[];
  whitelistRequests: RuleData[];
}

interface AccountWithRules extends AccountData {
  rules: RuleData[];
}

interface ChangelogEvent {
  type: "account_created" | "rule_created" | "rule_approved" | "rule_updated";
  title: string;
  description: string;
  timestamp: string;
  txHash: string | null;
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
  account_created: { bg: "bg-[#E9F5FF]", text: "text-[#082A73]", label: "Created" },
  rule_created: { bg: "bg-[#FFF3DF]", text: "text-[#B66A00]", label: "Requested" },
  rule_approved: { bg: "bg-[#E8FFF7]", text: "text-[#028A63]", label: "Approved" },
  rule_updated: { bg: "bg-[#EEF4FF]", text: "text-[#475569]", label: "Updated" },
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
          ? "border border-[#D9E4FF] bg-white font-semibold text-[#031B5A] shadow-[0_12px_24px_-20px_rgba(8,42,115,0.4)]"
          : "text-[#475569] hover:bg-white/80 hover:text-[#031B5A]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
      {label}
    </button>
  );
}

export function DashboardApp() {
  const { address, chainId, isConnected } = useAccount();

  const [activeNav, setActiveNav] = useState<NavKey>("rules");

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [homeAccounts, setHomeAccounts] = useState<AccountWithRules[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeReloadKey, setHomeReloadKey] = useState(0);
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEvent[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [addRuleAccount, setAddRuleAccount] = useState<AccountWithRules | null>(null);
  const reloadRules = useCallback(() => setHomeReloadKey((k) => k + 1), []);
  const hasAccount = accountData !== null;
  const resetDisconnectedState = () => {
    setAccountData(null);
    setAccountLoading(false);
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
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccountData(null);
          setAccountLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [chainId, isConnected, address]);

  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      !chainId ||
      !hasAccount ||
      activeNav !== "rules"
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
  }, [activeNav, address, chainId, hasAccount, homeReloadKey, isConnected]);

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

  const renderHomePanel = () => {
    if (homeLoading) {
      return (
        <div className="flex min-h-[420px] w-full items-center justify-center rounded-[28px] border border-[#D9E4FF] bg-white/95 px-8 py-12 shadow-[0_24px_80px_-52px_rgba(8,42,115,0.28)]">
          <div className="flex items-center gap-3 text-sm text-[#475569]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#082A73]" />
            Loading graph data for this owner address...
          </div>
        </div>
      );
    }

    if (homeError) {
      return (
        <div className="w-full max-w-3xl rounded-[28px] border border-[#FFD3DB] bg-[#FFF5F8] p-8 shadow-[0_24px_80px_-52px_rgba(8,42,115,0.22)]">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 text-[#FF5F7A]" />
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">
                Graph data is unavailable
              </h2>
              <p className="mt-2 text-sm text-[#475569]">{homeError}</p>
              <button
                type="button"
                onClick={() => setHomeReloadKey((current) => current + 1)}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#D9E4FF] bg-white px-4 py-2 text-sm font-medium text-[#031B5A] transition-colors hover:bg-[#EEF4FF]"
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
            <div className="rounded-[28px] border border-[#D9E4FF] bg-white p-8 text-center shadow-[0_20px_70px_-56px_rgba(8,42,115,0.28)]">
              <h2 className="text-xl font-semibold tracking-tight text-[#0F172A]">
                No accounts indexed for this owner
              </h2>
              <p className="mt-2 text-sm text-[#475569]">
                The connected wallet does not currently have any accounts in the
                subgraph for this owner address.
              </p>
            </div>
          ) : null}
          {homeAccounts.map((account, index) => (
            <article
              key={account.id}
              className="overflow-hidden rounded-[30px] border border-[#D9E4FF] bg-white shadow-[0_24px_72px_-56px_rgba(8,42,115,0.34)]"
            >
              <div className="border-b border-[#D9E4FF] bg-[linear-gradient(135deg,_#FFFFFF_0%,_#EEF4FF_100%)] p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748B]">
                      Account
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#0F172A]">
                      Account {index + 1}
                    </h2>
                    <p className="mt-2 text-sm text-[#475569]">
                      Approved actions available for this account.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#E8FFF7] px-3 py-1 text-xs font-medium text-[#028A63] ring-1 ring-[#B2F7DD]">
                      <ShieldCheck className="h-4 w-4" />
                      {account.rules.length} approved rule{account.rules.length === 1 ? "" : "s"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddRuleAccount(account)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] px-3 py-1 text-xs font-semibold text-[#031B5A] shadow-[0_16px_32px_-20px_rgba(25,217,255,0.75)] transition-transform hover:-translate-y-0.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Rule
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {account.rules.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#D9E4FF] bg-[#F7FAFF] p-5 text-sm text-[#475569]">
                    No approved whitelist requests were found for this account.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {account.rules.map((rule) => (
                      <section
                        key={rule.id}
                        className="rounded-2xl border border-[#D9E4FF] bg-[#F7FAFF] p-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="inline-flex rounded-full bg-[#E8FFF7] px-2.5 py-1 text-xs font-medium text-[#028A63]">
                              {rule.status}
                            </div>
                            <h4 className="mt-3 text-base font-semibold text-[#0F172A]">
                              {rule.tokenLabel}
                            </h4>
                            <p className="mt-1 text-sm text-[#475569]">
                              {rule.actionLabel}
                            </p>
                          </div>
                          <div className="text-xs text-[#64748B]">
                            Updated {formatTimestamp(rule.updatedAt)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">
                              Token Name
                            </p>
                            <p className="mt-1 text-sm text-[#0F172A]">
                              {rule.tokenName}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">
                              Description
                            </p>
                            <p className="mt-1 text-sm text-[#0F172A]">
                              {rule.description}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">
                              Max Amount
                            </p>
                            <p className="mt-1 text-sm text-[#0F172A]">
                              {rule.maxAmount}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">
                              Request Reason
                            </p>
                            <p className="mt-1 text-sm text-[#0F172A]">
                              {rule.metadata || "Approved whitelist rule"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">
                              Created
                            </p>
                            <p className="mt-1 text-sm text-[#0F172A]">
                              {formatTimestamp(rule.createdAt)}
                            </p>
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  };

  const renderChangelogPanel = () => {
    if (changelogLoading) {
      return (
        <div className="flex min-h-[420px] w-full items-center justify-center rounded-[28px] border border-[#D9E4FF] bg-white/95 px-8 py-12 shadow-[0_24px_80px_-52px_rgba(8,42,115,0.28)]">
          <div className="flex items-center gap-3 text-sm text-[#475569]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#082A73]" />
            Loading changelog...
          </div>
        </div>
      );
    }

    if (changelogError) {
      return (
        <div className="w-full max-w-3xl rounded-[28px] border border-[#FFD3DB] bg-[#FFF5F8] p-8 shadow-[0_24px_80px_-52px_rgba(8,42,115,0.22)]">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 text-[#FF5F7A]" />
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">
                Changelog unavailable
              </h2>
              <p className="mt-2 text-sm text-[#475569]">{changelogError}</p>
            </div>
          </div>
        </div>
      );
    }

    if (changelogEntries.length === 0) {
      return (
        <div className="w-full max-w-4xl rounded-[28px] border border-[#D9E4FF] bg-white p-8 text-center shadow-[0_20px_70px_-56px_rgba(8,42,115,0.28)]">
          <h2 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            No activity yet
          </h2>
          <p className="mt-2 text-sm text-[#475569]">
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
              className="flex gap-4 rounded-2xl border border-[#D9E4FF] bg-white p-5 shadow-[0_16px_36px_-28px_rgba(8,42,115,0.22)]"
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
                    <h3 className="text-sm font-semibold text-[#0F172A]">
                      {event.title}
                    </h3>
                  </div>
                  <span className="text-xs text-[#64748B]">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-[#475569]">
                  {event.description}
                </p>
                {event.txHash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-[#082A73] underline decoration-[#8CEFFF] transition-colors hover:text-[#19D9FF]"
                  >
                    View on Etherscan
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F7FAFF] text-[#0F172A]">
      <Header />
      <div className="flex min-h-0 flex-1">
        {hasAccount && isConnected && <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#D9E4FF] bg-[#EEF4FF]/80">
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
          </div>
        </aside>}

        <div className="flex min-w-0 flex-1 flex-col">
          {!hasAccount && !accountLoading ? (
            <main className="flex flex-1 items-center px-10 pb-20 pt-[8vh]" style={{ justifyContent: "left", paddingLeft: "20%" }}>
              <div className="w-full max-w-xl rounded-[32px] border border-[#D9E4FF] bg-white px-8 py-10 shadow-[0_28px_72px_-56px_rgba(8,42,115,0.34)]">
                <h1 className="text-2xl font-semibold leading-snug tracking-tight text-[#0F172A]">
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
                    <li key={item} className="flex items-center gap-2.5 text-sm text-[#475569]">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-[10px] font-bold text-[#082A73] ring-1 ring-[#D9E4FF]">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => router.push("/onboard")}
                  className="mt-8 rounded-xl bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] px-5 py-2.5 text-sm font-semibold text-[#031B5A] shadow-[0_22px_40px_-24px_rgba(25,217,255,0.7)] transition-transform hover:-translate-y-0.5"
                >
                  Get started
                </button>
              </div>
            </main>
          ) : accountLoading ? (
            <main className="flex flex-1 items-center justify-center px-10 pb-20 pt-[8vh]">
              <div className="flex items-center gap-3 rounded-full border border-[#D9E4FF] bg-white px-5 py-3 text-sm text-[#475569] shadow-[0_16px_36px_-28px_rgba(8,42,115,0.22)]">
                <LoaderCircle className="h-4 w-4 animate-spin text-[#082A73]" />
                Checking owner account on The Graph...
              </div>
            </main>
          ) : (
            <main className="flex-1 overflow-auto bg-[#F7FAFF] p-6">
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
          onClose={() => setAddRuleAccount(null)}
          onSuccess={reloadRules}
        />
      )}
    </div>
  );
}
