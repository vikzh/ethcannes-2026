"use client";

import { CheckCircle, Copy, ExternalLink } from "lucide-react";
import { useState, useCallback } from "react";
import Link from "next/link";
import { DEFAULT_GAS_FUND_ETH, addressUrl } from "@/lib/contracts";

function shortAddr(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyableAddress({ address, chainId }: { address: string; chainId: number }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [address]);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm text-zinc-900">{shortAddr(address)}</span>
      <button
        type="button"
        onClick={copy}
        className="text-zinc-400 transition-colors hover:text-zinc-600"
        title="Copy address"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <a
        href={addressUrl(chainId, address)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-400 transition-colors hover:text-zinc-600"
        title="View on Etherscan"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

interface StepCompleteProps {
  accountAddress: string;
  ownerAddress: string;
  agentAddress: string;
  chainId: number;
}

const MODULES = [
  "PolicyHookRuleSpend",
  "WhitelistRequestModule",
  "EmergencyControls",
  "AgentSessionValidator",
];

export function StepComplete({
  accountAddress,
  ownerAddress,
  agentAddress,
  chainId,
}: StepCompleteProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            You're all set
          </h2>
          <p className="text-sm text-zinc-600">
            Your agent wallet account is deployed and funded.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Account
            </p>
            <div className="mt-1">
              <CopyableAddress address={accountAddress} chainId={chainId} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Owner
              </p>
              <p className="mt-1 font-mono text-sm text-zinc-900">
                {shortAddr(ownerAddress)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Agent
              </p>
              <p className="mt-1 font-mono text-sm text-zinc-900">
                {shortAddr(agentAddress)}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Agent Funded
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-700">
              {DEFAULT_GAS_FUND_ETH} ETH
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Installed Modules
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {MODULES.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="inline-flex rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
