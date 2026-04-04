"use client";

import { ShieldCheck, Copy, ExternalLink, AlertTriangle, Send } from "lucide-react";
import { useState, useCallback } from "react";
import { formatEther, parseEther, type Address } from "viem";
import { useBalance, useSendTransaction } from "wagmi";
import Link from "next/link";
import {
  ACCOUNT_ABI,
  addressUrl,
  DEFAULT_GAS_FUND_ETH,
} from "@/lib/contracts";
import { useReadContract } from "wagmi";
import { TxStatus, type TxState } from "./tx-status";

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
      <button type="button" onClick={copy} className="text-zinc-400 hover:text-zinc-600" title="Copy">
        <Copy className="h-3.5 w-3.5" />
      </button>
      <a
        href={addressUrl(chainId, address)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-400 hover:text-zinc-600"
        title="View on Etherscan"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

interface AccountStatusProps {
  accountAddress: string;
  agentAddress: string;
  chainId: number;
}

export function AccountStatus({ accountAddress, agentAddress, chainId }: AccountStatusProps) {
  // Read owner from account
  const { data: owner } = useReadContract({
    address: accountAddress as Address,
    abi: ACCOUNT_ABI,
    functionName: "owner",
  });

  // Read agentSessionValidator
  const { data: validator } = useReadContract({
    address: accountAddress as Address,
    abi: ACCOUNT_ABI,
    functionName: "agentSessionValidator",
  });

  // Balances
  const { data: accountBalance } = useBalance({
    address: accountAddress as Address,
  });
  const { data: agentBalance } = useBalance({
    address: agentAddress as Address,
  });

  const validatorMissing =
    validator === "0x0000000000000000000000000000000000000000";
  const agentUnfunded = agentBalance && agentBalance.value === BigInt(0);

  // Fund agent
  const {
    sendTransaction,
    data: fundTxHash,
    isPending: isFundPending,
    isError: isFundError,
    error: fundError,
    reset: resetFund,
  } = useSendTransaction();

  let fundState: TxState = "idle";
  if (isFundPending) fundState = "confirming";
  else if (fundTxHash) fundState = "pending";
  else if (isFundError) fundState = "failed";

  const handleFund = useCallback(() => {
    sendTransaction({
      to: agentAddress as Address,
      value: parseEther(DEFAULT_GAS_FUND_ETH),
    });
  }, [agentAddress, sendTransaction]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          Active
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Account Already Set Up
        </h2>
      </div>

      {validatorMissing && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Agent validator not configured on this account.</span>
        </div>
      )}

      <div className="rounded-[20px] border border-zinc-200 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]">
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
                {owner ? shortAddr(owner as string) : "Loading..."}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Account Balance
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {accountBalance
                  ? `${parseFloat(formatEther(accountBalance.value)).toFixed(6)} ETH`
                  : "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Agent Balance
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {agentBalance
                  ? `${parseFloat(formatEther(agentBalance.value)).toFixed(6)} ETH`
                  : "Unavailable"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {agentUnfunded && fundState === "idle" && (
        <button
          type="button"
          onClick={handleFund}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
        >
          <Send className="h-4 w-4" />
          Fund Agent ({DEFAULT_GAS_FUND_ETH} ETH)
        </button>
      )}

      {fundState !== "idle" && (
        <TxStatus
          status={fundState}
          txHash={fundTxHash}
          error={fundError?.message?.split("\n")[0]}
          chainId={chainId}
          onRetry={fundState === "failed" ? () => resetFund() : undefined}
        />
      )}

      <Link
        href="/"
        className="inline-flex rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
