"use client";

import {
  ArrowLeftRight,
  BookOpen,
  Home,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import {
  MOCK_TRANSACTIONS,
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
  | "rules"
  | "changelog"
  | "settings";

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

  const [activeNav, setActiveNav] = useState<NavKey>("changelog");
  const [tab, setTab] = useState<TabKey>("queue");
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

            <nav className="mt-auto space-y-0.5 border-t border-zinc-100 pt-3">
              <NavItem
                icon={Settings}
                label="Settings"
                active={activeNav === "settings"}
                onClick={() => setActiveNav("settings")}
              />
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
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
