"use client";

import { useState, useEffect } from "react";
import {
  X,
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { encodeFunctionData, parseUnits, type Address } from "viem";
import {
  ISOLATED_ACCOUNT_ABI,
  POLICY_HOOK_ABI,
  ERC20_ABI,
  MODE_SINGLE,
  encodeSingle,
  TRANSFER_SELECTOR,
  addressToBytes32,
  SEPOLIA_TOKENS,
} from "@/lib/contracts";

type RuleType = "whitelist" | "narrow";

/** Special value in the token dropdown meaning "enter address manually" */
const CUSTOM_TOKEN = "__custom__" as const;

interface AddRuleModalProps {
  accountAddress: Address;
  policyHookAddress: Address;
  onClose: () => void;
  onSuccess: () => void;
}

const PERIOD_OPTIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "1 day", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
];

export function AddRuleModal({
  accountAddress,
  policyHookAddress,
  onClose,
  onSuccess,
}: AddRuleModalProps) {
  const [ruleType, setRuleType] = useState<RuleType>("narrow");
  const [selectedToken, setSelectedToken] = useState(SEPOLIA_TOKENS[0].address as string);
  const [customTokenAddress, setCustomTokenAddress] = useState("");
  const [allowedDestination, setAllowedDestination] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [periodIndex, setPeriodIndex] = useState(2); // default: 1 day

  const isCustom = selectedToken === CUSTOM_TOKEN;
  const knownToken = !isCustom
    ? SEPOLIA_TOKENS.find((t) => t.address === selectedToken)
    : undefined;

  const resolvedTokenAddress = isCustom ? customTokenAddress : selectedToken;
  const isValidToken = /^0x[a-fA-F0-9]{40}$/.test(resolvedTokenAddress);
  const isValidDestination = /^0x[a-fA-F0-9]{40}$/.test(allowedDestination);

  // Fetch token metadata only for custom addresses
  const shouldFetchMeta = isCustom && isValidToken;

  const { data: fetchedDecimals } = useReadContract({
    address: shouldFetchMeta ? (resolvedTokenAddress as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: shouldFetchMeta },
  });

  const { data: fetchedSymbol } = useReadContract({
    address: shouldFetchMeta ? (resolvedTokenAddress as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: shouldFetchMeta },
  });

  const { data: fetchedName } = useReadContract({
    address: shouldFetchMeta ? (resolvedTokenAddress as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "name",
    query: { enabled: shouldFetchMeta },
  });

  const decimals = knownToken?.decimals ?? fetchedDecimals ?? 18;
  const tokenSymbol = knownToken?.symbol ?? fetchedSymbol;
  const tokenName = knownToken?.name ?? fetchedName;

  const {
    writeContract,
    data: txHash,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Close modal after success
  useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, onClose, onSuccess]);

  const canSubmit =
    isValidToken &&
    (ruleType === "whitelist" || (isValidDestination && maxAmount.length > 0)) &&
    !isSigning &&
    !isConfirming &&
    !isConfirmed;

  function handleSubmit() {
    resetWrite();

    let hookCalldata: `0x${string}`;

    if (ruleType === "whitelist") {
      // addWhitelistEntry(tokenAddress, transferSelector)
      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addWhitelistEntry",
        args: [resolvedTokenAddress as Address, TRANSFER_SELECTOR],
      });
    } else {
      // addEqRuleWithSpend — narrow rule restricting destination
      const parsedAmount = parseUnits(maxAmount, decimals);
      const period = PERIOD_OPTIONS[periodIndex].seconds;

      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addEqRuleWithSpend",
        args: [
          resolvedTokenAddress as Address,
          TRANSFER_SELECTOR,
          // conditions: param 0 (destination address) must equal allowedDestination
          [
            {
              paramIndex: 0,
              expectedValue: addressToBytes32(allowedDestination as Address),
            },
          ],
          // spend config: param 1 is the amount
          {
            spendParamIndex: 1,
            maxPerPeriod: parsedAmount,
            periodDuration: BigInt(period),
          },
        ],
      });
    }

    const executionCalldata = encodeSingle(policyHookAddress, 0n, hookCalldata);

    writeContract({
      address: accountAddress,
      abi: ISOLATED_ACCOUNT_ABI,
      functionName: "execute",
      args: [MODE_SINGLE, executionCalldata],
    });
  }

  const error = writeError || receiptError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#031B5A]/35 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[#D9E4FF] bg-white p-8 shadow-[0_32px_80px_-56px_rgba(2,13,46,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Add Allow Rule
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#64748B] transition-colors hover:bg-[#EEF4FF] hover:text-[#031B5A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-[#64748B]">
          Define what your AI agent is allowed to do with this account.
        </p>

        {/* Rule type toggle */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setRuleType("narrow")}
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
              ruleType === "narrow"
                ? "border-[#19D9FF] bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] text-[#031B5A] shadow-[0_18px_36px_-24px_rgba(25,217,255,0.65)]"
                : "border-[#D9E4FF] bg-white text-[#475569] hover:border-[#8CEFFF]"
            }`}
          >
            <span className="font-medium">Restricted transfer</span>
            <span className="mt-1 block text-xs opacity-70">
              Specific destination + spending limit
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRuleType("whitelist")}
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
              ruleType === "whitelist"
                ? "border-[#19D9FF] bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] text-[#031B5A] shadow-[0_18px_36px_-24px_rgba(25,217,255,0.65)]"
                : "border-[#D9E4FF] bg-white text-[#475569] hover:border-[#8CEFFF]"
            }`}
          >
            <span className="font-medium">Broad whitelist</span>
            <span className="mt-1 block text-xs opacity-70">
              Allow transfers to any address
            </span>
          </button>
        </div>

        {/* Form */}
        <div className="mt-6 space-y-4">
          {/* Token selector */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-[#64748B]">
              Token
            </label>
            <div className="relative mt-1.5">
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="w-full appearance-none rounded-xl border border-[#D9E4FF] bg-[#F7FAFF] px-4 py-2.5 pr-10 text-sm text-[#0F172A] focus:border-[#19D9FF] focus:outline-none focus:ring-2 focus:ring-[#19D9FF]/20"
              >
                {SEPOLIA_TOKENS.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.name} ({t.symbol})
                  </option>
                ))}
                <option value={CUSTOM_TOKEN}>Custom token...</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            </div>
          </div>

          {/* Custom token address — shown only when "Custom token" is selected */}
          {isCustom && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-[#64748B]">
                Token contract address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={customTokenAddress}
                onChange={(e) => setCustomTokenAddress(e.target.value.trim())}
                className="mt-1.5 w-full rounded-xl border border-[#D9E4FF] bg-[#F7FAFF] px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#19D9FF] focus:outline-none focus:ring-2 focus:ring-[#19D9FF]/20"
              />
              {isValidToken && fetchedSymbol && (
                <p className="mt-1.5 text-xs text-[#64748B]">
                  Detected: {fetchedName ? `${fetchedName} (${fetchedSymbol})` : fetchedSymbol} — {decimals} decimals
                </p>
              )}
            </div>
          )}

          {/* Narrow rule fields */}
          {ruleType === "narrow" && (
            <>
              {/* Allowed destination */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-[#64748B]">
                  Allowed destination address
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={allowedDestination}
                  onChange={(e) =>
                    setAllowedDestination(e.target.value.trim())
                  }
                  className="mt-1.5 w-full rounded-xl border border-[#D9E4FF] bg-[#F7FAFF] px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#19D9FF] focus:outline-none focus:ring-2 focus:ring-[#19D9FF]/20"
                />
              </div>

              {/* Max amount */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-[#64748B]">
                  Max amount per period{tokenSymbol ? ` (${tokenSymbol})` : ""}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="100"
                  value={maxAmount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    setMaxAmount(v);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#D9E4FF] bg-[#F7FAFF] px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#19D9FF] focus:outline-none focus:ring-2 focus:ring-[#19D9FF]/20"
                />
              </div>

              {/* Period */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-[#64748B]">
                  Period duration
                </label>
                <div className="relative mt-1.5">
                  <select
                    value={periodIndex}
                    onChange={(e) => setPeriodIndex(Number(e.target.value))}
                    className="w-full appearance-none rounded-xl border border-[#D9E4FF] bg-[#F7FAFF] px-4 py-2.5 pr-10 text-sm text-[#0F172A] focus:border-[#19D9FF] focus:outline-none focus:ring-2 focus:ring-[#19D9FF]/20"
                  >
                    {PERIOD_OPTIONS.map((opt, i) => (
                      <option key={opt.seconds} value={i}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#FFD3DB] bg-[#FFF5F8] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5F7A]" />
            <p className="text-xs text-[#B4233F]">
              {(error as { shortMessage?: string }).shortMessage ||
                error.message}
            </p>
          </div>
        )}

        {/* Success */}
        {isConfirmed && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B2F7DD] bg-[#E8FFF7] p-3">
            <CheckCircle2 className="h-4 w-4 text-[#028A63]" />
            <p className="text-xs font-medium text-[#028A63]">
              Rule added successfully! Closing...
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D9E4FF] px-4 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#EEF4FF]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] px-5 py-2.5 text-sm font-semibold text-[#031B5A] shadow-[0_20px_40px_-24px_rgba(25,217,255,0.75)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSigning ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Confirm in wallet...
              </>
            ) : isConfirming ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              "Add Rule"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
