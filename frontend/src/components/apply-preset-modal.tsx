"use client";

import { X, LoaderCircle, AlertCircle, Sparkles, ArrowRight } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { formatUnits, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  ISOLATED_ACCOUNT_ABI,
  MODE_BATCH,
  encodeBatch,
} from "@/lib/contracts";
import { useEnsPreset } from "@/lib/use-ens-preset";
import { presetToCalls, type PresetTransfer } from "@/lib/preset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(transfer: PresetTransfer): string {
  const decimals = transfer.decimals ?? 18;
  return formatUnits(BigInt(transfer.maxPerPeriod), decimals);
}

function formatPeriod(seconds: string): string {
  const s = Number(seconds);
  if (s >= 86400 && s % 86400 === 0) return `${s / 86400}d`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600}h`;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TransferPreviewRow({ transfer }: { transfer: PresetTransfer }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3">
      <div className="min-w-0">
        <p className="font-mono text-sm font-medium text-zinc-900">
          {transfer.symbol ?? shortAddr(transfer.token)}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 font-mono truncate">
          {transfer.token}
        </p>
        {transfer.destination ? (
          <p className="mt-1 text-xs text-zinc-600">
            To:{" "}
            <span className="font-mono">{shortAddr(transfer.destination)}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">Any destination</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-zinc-900">
          {formatAmount(transfer)}{" "}
          <span className="font-normal text-zinc-500">{transfer.symbol ?? ""}</span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          per {formatPeriod(transfer.periodDuration)}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface ApplyPresetModalProps {
  accountAddress: string;
  policyHookAddress: string;
  chainId: number;
  onClose: () => void;
  onApplied: () => void;
}

export function ApplyPresetModal({
  accountAddress,
  policyHookAddress,
  chainId,
  onClose,
  onApplied,
}: ApplyPresetModalProps) {
  const [ensInput, setEnsInput] = useState("");
  const [textRecordKeyInput, setTextRecordKeyInput] = useState("agent.preset");
  // Debounce the ENS lookup so we don't fire on every keystroke
  const [debouncedEns, setDebouncedEns] = useState("");
  const [debouncedTextRecordKey, setDebouncedTextRecordKey] = useState("agent.preset");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedEns(ensInput.trim()), 500);
    return () => clearTimeout(id);
  }, [ensInput]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTextRecordKey(textRecordKeyInput), 300);
    return () => clearTimeout(id);
  }, [textRecordKeyInput]);

  const {
    preset,
    isLoading,
    error,
  } = useEnsPreset(debouncedEns, debouncedTextRecordKey, chainId);

  // Write
  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    isError: isWriteError,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isReceiptLoading } =
    useWaitForTransactionReceipt({ hash: txHash });

  // Close + notify on success
  useEffect(() => {
    if (receipt) {
      onApplied();
    }
  }, [receipt, onApplied]);

  const handleApply = useCallback(() => {
    if (!preset) return;

    const calls = presetToCalls(preset).map((callData) => ({
      target: policyHookAddress as Address,
      value: BigInt(0),
      callData,
    }));

    const executionCalldata = encodeBatch(calls);

    writeContract({
      address: accountAddress as Address,
      abi: ISOLATED_ACCOUNT_ABI,
      functionName: "execute",
      args: [MODE_BATCH, executionCalldata],
      gas: BigInt(5_000_000),
    });
  }, [preset, accountAddress, policyHookAddress, writeContract]);

  // Derived tx state
  const isConfirming = isWritePending;
  const isPending = !!txHash && isReceiptLoading;
  const isConfirmed = !!receipt;
  const isFailed = isWriteError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-[28px] border border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-900">Apply ENS Preset</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* ENS name input */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Preset ENS Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={ensInput}
                onChange={(e) => setEnsInput(e.target.value)}
                placeholder="usdc-trader.presets.eth"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-mono text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 pr-10"
              />
              {isLoading && (
                <LoaderCircle className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-zinc-400" />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Text Record Key
            </label>
            <input
              type="text"
              value={textRecordKeyInput}
              onChange={(e) => setTextRecordKeyInput(e.target.value)}
              placeholder="agent.preset"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-mono text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400"
            />
          </div>

          {/* Error */}
          {error && debouncedEns && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          {/* Preset preview */}
          {preset && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-900">{preset.name}</p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  {preset.transfers.length} rule{preset.transfers.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-2">
                {preset.transfers.map((t, i) => (
                  <TransferPreviewRow key={i} transfer={t} />
                ))}
              </div>

              <p className="text-xs text-zinc-500">
                Applying this preset will add {preset.transfers.length} transfer rule
                {preset.transfers.length !== 1 ? "s" : ""} to the account&apos;s policy hook
                in a single transaction.
              </p>
            </div>
          )}

          {/* Tx states */}
          {isConfirming && (
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Waiting for wallet confirmation…
            </div>
          )}
          {isPending && (
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Transaction submitted, waiting for confirmation…
            </div>
          )}
          {isConfirmed && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Preset applied successfully.
            </div>
          )}
          {isFailed && (
            <div className="space-y-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {writeError?.message?.includes("User rejected")
                  ? "Transaction rejected."
                  : writeError?.message?.split("\n")[0] ?? "Transaction failed."}
              </div>
              <button
                type="button"
                onClick={resetWrite}
                className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!preset || isConfirming || isPending || isConfirmed}
            onClick={handleApply}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply Preset
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
