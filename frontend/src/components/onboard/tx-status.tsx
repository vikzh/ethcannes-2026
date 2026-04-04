"use client";

import { Check, LoaderCircle, CircleAlert, ExternalLink } from "lucide-react";
import { txUrl } from "@/lib/contracts";

export type TxState = "idle" | "confirming" | "pending" | "confirmed" | "failed";

interface TxStatusProps {
  status: TxState;
  txHash?: string;
  error?: string;
  chainId: number;
  onRetry?: () => void;
}

export function TxStatus({ status, txHash, error, chainId, onRetry }: TxStatusProps) {
  if (status === "idle") return null;

  return (
    <div className="mt-4 rounded-xl border p-4 text-sm">
      {status === "confirming" && (
        <div className="flex items-center gap-3 text-amber-700">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          <span>Waiting for wallet confirmation...</span>
        </div>
      )}

      {status === "pending" && (
        <div className="flex items-center gap-3 text-amber-700">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          <div className="flex flex-col gap-1">
            <span>Transaction submitted</span>
            {txHash && (
              <a
                href={txUrl(chainId, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 underline decoration-zinc-300 hover:text-zinc-700"
              >
                View on Etherscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {status === "confirmed" && (
        <div className="flex items-center gap-3 text-emerald-700">
          <Check className="h-5 w-5" />
          <div className="flex flex-col gap-1">
            <span>Transaction confirmed</span>
            {txHash && (
              <a
                href={txUrl(chainId, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 underline decoration-zinc-300 hover:text-zinc-700"
              >
                View on Etherscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="flex items-start gap-3 text-rose-700">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-2">
            <span>{error || "Transaction failed"}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="self-start rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
