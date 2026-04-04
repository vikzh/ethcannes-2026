"use client";

import {
  ArrowLeftRight,
  BookOpen,
  Clock,
  Code2,
  Coins,
  Home,
  Landmark,
  LayoutGrid,
  Link2,
  Loader2,
  Repeat2,
  Settings,
  Upload,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import {
  MOCK_PERMISSIONS,
  MOCK_TRANSACTIONS,
  type MockPermission,
} from "@/lib/mock-data";

const THEGRAPH_URL =
  "https://gateway.thegraph.com/api/subgraphs/id/ApzeUQepZLrJdxtipSY6nVJYPb62kjKNFv8orpBRLk1E";
const THEGRAPH_API_KEY = "68d40f402d446145454a9249c38bb491";

interface AccountData {
  id: string;
  owner: string;
  policyHook: string;
  agentSessionValidator: string;
}

async function fetchAccountByOwner(
  owner: string,
): Promise<AccountData | null> {
  const res = await fetch(THEGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${THEGRAPH_API_KEY}`,
    },
    body: JSON.stringify({
      query: `{ accounts(first: 1, where: { owner: "${owner}" }) { id owner policyHook agentSessionValidator } }`,
    }),
  });
  const json = await res.json();
  const accounts: AccountData[] = json?.data?.accounts ?? [];
  return accounts.length > 0 ? accounts[0] : null;
}

type NavKey =
  | "home"
  | "assets"
  | "transactions"
  | "address-book"
  | "apps"
  | "swap"
  | "bridge"
  | "earn"
  | "stake"
  | "settings"
  | "api";

type TabKey = "queue" | "history" | "messages";

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
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
  const { address, isConnected } = useAccount();

  const [activeNav, setActiveNav] = useState<NavKey>("transactions");
  const [tab, setTab] = useState<TabKey>("queue");
  const [permissions, setPermissions] = useState<MockPermission[]>(() =>
    MOCK_PERMISSIONS.map((p) => ({ ...p })),
  );
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const hasAccount = accountData !== null;

  useEffect(() => {
    if (!isConnected || !address) {
      setAccountData(null);
      return;
    }
    let cancelled = false;
    setAccountLoading(true);
    fetchAccountByOwner(address).then((data) => {
      if (!cancelled) {
        setAccountData(data);
        setAccountLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setAccountData(null);
        setAccountLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [isConnected, address]);

  const router = useRouter();

  useEffect(() => {
    if (uploadProgress === null) return;
    if (uploadProgress >= 100) {
      const t = window.setTimeout(() => setUploadProgress(null), 800);
      return () => window.clearTimeout(t);
    }
    const id = window.setInterval(() => {
      setUploadProgress((p) => {
        if (p === null) return null;
        const next = p + 8 + Math.random() * 12;
        return next >= 100 ? 100 : next;
      });
    }, 280);
    return () => window.clearInterval(id);
  }, [uploadProgress]);

  const startUploadDemo = () => {
    setUploadProgress(0);
  };

  const togglePermission = (id: string) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
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
                icon={Home}
                label="Home"
                active={activeNav === "home"}
                onClick={() => setActiveNav("home")}
              />
              <NavItem
                icon={Wallet}
                label="Assets"
                active={activeNav === "assets"}
                onClick={() => setActiveNav("assets")}
              />
              <NavItem
                icon={ArrowLeftRight}
                label="Transactions"
                active={activeNav === "transactions"}
                onClick={() => setActiveNav("transactions")}
              />
              <NavItem
                icon={BookOpen}
                label="Address book"
                active={activeNav === "address-book"}
                onClick={() => setActiveNav("address-book")}
              />
              <NavItem
                icon={LayoutGrid}
                label="Apps"
                active={activeNav === "apps"}
                onClick={() => setActiveNav("apps")}
              />
            </nav>

            <p className="mb-1 mt-5 px-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Tools
            </p>
            <nav className="space-y-0.5">
              <NavItem
                icon={Repeat2}
                label="Swap"
                active={activeNav === "swap"}
                onClick={() => setActiveNav("swap")}
              />
              <NavItem
                icon={Link2}
                label="Bridge"
                active={activeNav === "bridge"}
                onClick={() => setActiveNav("bridge")}
              />
              <NavItem
                icon={Coins}
                label="Earn"
                active={activeNav === "earn"}
                onClick={() => setActiveNav("earn")}
              />
              <NavItem
                icon={Landmark}
                label="Stake"
                active={activeNav === "stake"}
                onClick={() => setActiveNav("stake")}
              />
            </nav>

            <p className="mb-1 mt-5 px-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Permissions
            </p>
            <ul className="space-y-2 px-1 pb-2">
              {permissions.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-900">{p.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                        {p.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.enabled}
                      onClick={() => togglePermission(p.id)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        p.enabled ? "bg-zinc-900" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          p.enabled ? "left-4" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <nav className="mt-auto space-y-0.5 border-t border-zinc-100 pt-3">
              <NavItem
                icon={Settings}
                label="Settings"
                active={activeNav === "settings"}
                onClick={() => setActiveNav("settings")}
              />
              <div className="relative">
                <NavItem
                  icon={Code2}
                  label="API"
                  active={activeNav === "api"}
                  onClick={() => setActiveNav("api")}
                />
                <span className="pointer-events-none absolute right-3 top-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  New
                </span>
              </div>
            </nav>
          </div>
        </aside>}

        <div className="flex min-w-0 flex-1 flex-col">
          {!hasAccount ? (
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
          ) : (
            <main className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200">
                  <div className="flex gap-6">
                    {(
                      [
                        ["queue", "Queue"],
                        ["history", "History"],
                        ["messages", "Messages"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`relative pb-3 text-sm font-medium transition-colors ${
                          tab === key
                            ? "text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-800"
                        }`}
                      >
                        {label}
                        {tab === key ? (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-zinc-900" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled
                    className="mb-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-400"
                  >
                    Bulk execute
                  </button>
                </div>

                {tab === "queue" && (
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center">
                    {uploadProgress !== null ? (
                      <div className="w-full max-w-sm">
                        <div className="mb-3 flex items-center justify-center gap-2 text-zinc-700">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="text-sm font-medium">
                            Uploading batch…
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className="h-full rounded-full bg-zinc-900 transition-[width] duration-200"
                            style={{ width: `${Math.min(100, uploadProgress)}%` }}
                          />
                        </div>
                        <p className="mt-2 font-mono text-xs text-zinc-500">
                          {Math.round(Math.min(100, uploadProgress))}%
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                          <Clock className="h-7 w-7 text-zinc-400" strokeWidth={1.25} />
                        </div>
                        <p className="max-w-xs text-sm text-zinc-600">
                          Queued transactions will appear here.
                        </p>
                        <button
                          type="button"
                          onClick={startUploadDemo}
                          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                        >
                          <Upload className="h-4 w-4" />
                          Simulate upload
                        </button>
                      </>
                    )}
                  </div>
                )}

                {tab === "history" && (
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Label</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {MOCK_TRANSACTIONS.map((tx) => (
                          <tr key={tx.id} className="bg-white hover:bg-zinc-50/80">
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                                  tx.direction === "in"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : "bg-orange-50 text-orange-800"
                                }`}
                              >
                                {tx.direction === "in" ? "In" : "Out"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={
                                  tx.status === "success"
                                    ? "text-emerald-700"
                                    : "text-red-600"
                                }
                              >
                                {tx.status === "success" ? "Success" : "Failed"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                              {new Date(tx.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                              {tx.amount}
                            </td>
                            <td className="px-4 py-3 text-zinc-600">{tx.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tab === "messages" && (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/30 px-6 py-12 text-center text-sm text-zinc-500">
                    No off-chain messages yet.
                  </div>
                )}
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
