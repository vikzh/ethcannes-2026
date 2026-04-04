"use client";

import {
  ArrowLeftRight,
  BookOpen,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";

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

  const [activeNav, setActiveNav] = useState<NavKey>("rules");

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [homeAccounts, setHomeAccounts] = useState<AccountWithRules[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeReloadKey, setHomeReloadKey] = useState(0);
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

          const groupedAccounts = response.accounts.map((account) => ({
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

  const router = useRouter();

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
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Account
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                      Account {index + 1}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600">
                      Approved actions available for this account.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <ShieldCheck className="h-4 w-4" />
                    {account.rules.length} approved rule{account.rules.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="p-6">
                {account.rules.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
                    No approved whitelist requests were found for this account.
                  </div>
                ) : (
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
              </div>
            </article>
          ))}
        </div>
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
                  onClick={() => router.push("/onboard")}
                  className="mt-8 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Get started
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
              <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
                {activeNav === "rules" ? renderHomePanel() : null}
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
