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
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
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

type RuleType = "whitelist" | "narrow" | "ens" | "custom";

/** Special value in the token dropdown meaning "enter address manually" */
const CUSTOM_TOKEN = "__custom__" as const;

export interface RulePrefill {
  tokenAddress?: string;
  destinationAddress?: string;
}

interface AddRuleModalProps {
  accountAddress: Address;
  policyHookAddress: Address;
  onClose: () => void;
  onSuccess: () => void;
  prefill?: RulePrefill;
}

const PERIOD_OPTIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "1 day", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
];

function normalizeAddress(value: string): Address | undefined {
  if (!isAddress(value, { strict: false })) return undefined;
  return getAddress(value);
}

/** Empty → ERC-20 transfer selector; invalid hex → undefined */
function resolveCustomSelector(raw: string): `0x${string}` | undefined {
  const t = raw.trim();
  if (t === "") return TRANSFER_SELECTOR;
  return /^0x[0-9a-fA-F]{8}$/.test(t) ? (t as `0x${string}`) : undefined;
}

function isValidOptionalMaxAmount18(raw: string): boolean {
  const t = raw.trim();
  if (t === "") return true;
  try {
    parseUnits(t, 18);
    return true;
  } catch {
    return false;
  }
}

const SPEND_DISABLED_PARAM_INDEX = 255;

export function AddRuleModal({
  accountAddress,
  policyHookAddress,
  onClose,
  onSuccess,
  prefill,
}: AddRuleModalProps) {
  // Resolve prefilled token: use known token if it matches, otherwise custom
  const prefillKnown = prefill?.tokenAddress
    ? SEPOLIA_TOKENS.find(
        (t) => t.address.toLowerCase() === prefill.tokenAddress!.toLowerCase(),
      )
    : undefined;
  const initialToken = prefillKnown
    ? prefillKnown.address
    : prefill?.tokenAddress
      ? CUSTOM_TOKEN
      : SEPOLIA_TOKENS[0].address;

  const [ruleType, setRuleType] = useState<RuleType>(
    prefill?.destinationAddress ? "narrow" : "narrow",
  );
  const [selectedToken, setSelectedToken] = useState(initialToken as string);
  const [customTokenAddress, setCustomTokenAddress] = useState(
    !prefillKnown && prefill?.tokenAddress ? prefill.tokenAddress : "",
  );
  const [allowedDestination, setAllowedDestination] = useState(
    prefill?.destinationAddress ?? "",
  );
  const [maxAmount, setMaxAmount] = useState("");
  const [periodIndex, setPeriodIndex] = useState(2); // default: 1 day
  const [ensRule, setEnsRule] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [customDestination, setCustomDestination] = useState("");
  const [customSelector, setCustomSelector] = useState("0xa9059cbb");

  const isCustom = selectedToken === CUSTOM_TOKEN;
  const knownToken = !isCustom
    ? SEPOLIA_TOKENS.find((t) => t.address === selectedToken)
    : undefined;

  const resolvedTokenAddress = isCustom ? customTokenAddress : selectedToken;
  const normalizedTokenAddress = normalizeAddress(resolvedTokenAddress);
  const normalizedDestination = normalizeAddress(allowedDestination);
  const isValidToken = normalizedTokenAddress !== undefined;
  const isValidDestination = normalizedDestination !== undefined;

  // Fetch token metadata only for custom addresses
  const shouldFetchMeta = isCustom && isValidToken;

  const { data: fetchedDecimals } = useReadContract({
    address: shouldFetchMeta ? normalizedTokenAddress : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: shouldFetchMeta },
  });

  const { data: fetchedSymbol } = useReadContract({
    address: shouldFetchMeta ? normalizedTokenAddress : undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: shouldFetchMeta },
  });

  const { data: fetchedName } = useReadContract({
    address: shouldFetchMeta ? normalizedTokenAddress : undefined,
    abi: ERC20_ABI,
    functionName: "name",
    query: { enabled: shouldFetchMeta },
  });

  const decimals = knownToken?.decimals ?? fetchedDecimals ?? 18;
  const tokenSymbol = knownToken?.symbol ?? fetchedSymbol;

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

  const normalizedCustomSource = normalizeAddress(customSource);
  const normalizedCustomDestination = normalizeAddress(customDestination);
  const resolvedCustomSelector = resolveCustomSelector(customSelector);

  const canSubmit =
    (ruleType === "ens"
      ? ensRule.trim().length > 0 && maxAmount.length > 0
      : ruleType === "custom"
        ? !!normalizedCustomSource &&
            resolvedCustomSelector !== undefined &&
            isValidOptionalMaxAmount18(maxAmount)
        : isValidToken &&
          (ruleType === "whitelist" || (isValidDestination && maxAmount.length > 0))) &&
    !isSigning &&
    !isConfirming &&
    !isConfirmed;

  function handleSubmit() {
    resetWrite();

    let hookCalldata: `0x${string}`;

    if (ruleType === "custom") {
      if (!normalizedCustomSource) return;
      const selectorResolved = resolveCustomSelector(customSelector);
      if (!selectorResolved) return;

      const conditions = normalizedCustomDestination
        ? [
            {
              paramIndex: 0,
              expectedValue: addressToBytes32(normalizedCustomDestination),
            },
          ]
        : [];

      const maxTrim = maxAmount.trim();
      const spend =
        maxTrim.length > 0
          ? {
              spendParamIndex: 1,
              maxPerPeriod: parseUnits(maxTrim, 18),
              periodDuration: BigInt(PERIOD_OPTIONS[periodIndex].seconds),
            }
          : {
              spendParamIndex: SPEND_DISABLED_PARAM_INDEX,
              maxPerPeriod: BigInt(0),
              periodDuration: BigInt(0),
            };

      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addEqRuleWithSpend",
        args: [
          normalizedCustomSource,
          selectorResolved,
          conditions,
          spend,
        ],
      });
    } else if (ruleType === "ens") {
      // addEnsPolicy(ensName, maxPerPeriod, periodDuration)
      const parsedAmount = parseUnits(maxAmount, 18);
      const period = PERIOD_OPTIONS[periodIndex].seconds;
      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addEnsPolicy",
        args: [ensRule.trim(), parsedAmount, BigInt(period)],
      });
    } else if (ruleType === "whitelist") {
      if (!normalizedTokenAddress) return;
      // addWhitelistEntry(tokenAddress, transferSelector)
      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addWhitelistEntry",
        args: [normalizedTokenAddress, TRANSFER_SELECTOR],
      });
    } else {
      if (!normalizedTokenAddress) return;
      if (!normalizedDestination) return;

      // addEqRuleWithSpend — narrow rule restricting destination
      const parsedAmount = parseUnits(maxAmount, decimals);
      const period = PERIOD_OPTIONS[periodIndex].seconds;

      hookCalldata = encodeFunctionData({
        abi: POLICY_HOOK_ABI,
        functionName: "addEqRuleWithSpend",
        args: [
          normalizedTokenAddress,
          TRANSFER_SELECTOR,
          // conditions: param 0 (destination address) must equal allowedDestination
          [
            {
              paramIndex: 0,
              expectedValue: addressToBytes32(normalizedDestination),
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

    const executionCalldata = encodeSingle(policyHookAddress, BigInt(0), hookCalldata);

    writeContract({
      address: accountAddress,
      abi: ISOLATED_ACCOUNT_ABI,
      functionName: "execute",
      args: [MODE_SINGLE, executionCalldata],
      gas: BigInt(5_000_000),
    });
  }

  const error = writeError || receiptError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Add Allow Rule
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-zinc-500">
          Define what your AI agent is allowed to do with this account.
        </p>

        {/* Rule type toggle */}
        <div className="mt-6 flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setRuleType("ens")}
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all flex flex-col justify-center ${
              ruleType === "ens"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            <span className="font-medium">ENS policy</span>
            <span className="mt-1 block text-xs opacity-70">
              Token &amp; destination via ENS name
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRuleType("narrow")}
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all flex flex-col justify-center ${
              ruleType === "narrow"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
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
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all flex flex-col justify-center ${
              ruleType === "whitelist"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            <span className="font-medium">Broad whitelist</span>
            <span className="mt-1 block text-xs opacity-70">
              Allow transfers to any address
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRuleType("custom")}
            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-all flex flex-col justify-center ${
              ruleType === "custom"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            <span className="font-medium">Custom rule</span>
            <span className="mt-1 block text-xs opacity-70">
              Specify all fields manually
            </span>
          </button>
        </div>

        {/* Form */}
        <div className="mt-6 space-y-4">
          {/* ENS policy field */}
          {ruleType === "ens" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                ENS rule
              </label>
              <input
                type="text"
                placeholder="vitalik.buterin:uniswap"
                value={ensRule}
                onChange={(e) => setEnsRule(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                ENS policy name that combines token address and destination (e.g. owner:protocol)
              </p>
            </div>
          )}

          {/* Custom rule fields */}
          {ruleType === "custom" && (
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Source address (target contract)
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value.trim())}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Destination address (optional)
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={customDestination}
                  onChange={(e) => setCustomDestination(e.target.value.trim())}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Function selector (optional)
                </label>
                <input
                  type="text"
                  placeholder="0xa9059cbb"
                  value={customSelector}
                  onChange={(e) => setCustomSelector(e.target.value.trim())}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <p className="mt-1.5 text-xs text-zinc-500">
                  4-byte selector; leave blank to use ERC-20 transfer (0xa9059cbb)
                </p>
              </div>
            </>
          )}

          {/* Token selector — hidden for ENS policy and custom rule */}
          {ruleType !== "ens" && ruleType !== "custom" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Token
              </label>
              <div className="relative mt-1.5">
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pr-10 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  {SEPOLIA_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>
                      {t.name} ({t.symbol})
                    </option>
                  ))}
                  <option value={CUSTOM_TOKEN}>Custom token...</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>
          )}

          {/* Custom token address — shown only when "Custom token" is selected */}
          {ruleType !== "ens" && ruleType !== "custom" && isCustom && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Token contract address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={customTokenAddress}
                onChange={(e) => setCustomTokenAddress(e.target.value.trim())}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              {isValidToken && fetchedSymbol && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Detected: {fetchedName ? `${fetchedName} (${fetchedSymbol})` : fetchedSymbol} — {decimals} decimals
                </p>
              )}
            </div>
          )}

          {/* Narrow-only: Allowed destination */}
          {ruleType === "narrow" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Allowed destination address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={allowedDestination}
                onChange={(e) =>
                  setAllowedDestination(e.target.value.trim())
                }
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          )}

          {/* Max amount & Period — shown for narrow and ens */}
          {(ruleType === "narrow" || ruleType === "ens" || ruleType === "custom") && (
            <>
              {/* Max amount */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Max amount per period
                  {ruleType === "custom" ? " (optional)" : ""}
                  {tokenSymbol ? ` (${tokenSymbol})` : ""}
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
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>

              {/* Period */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Period duration
                  {ruleType === "custom" && maxAmount.trim().length === 0
                    ? " (optional)"
                    : ""}
                </label>
                {ruleType === "custom" && maxAmount.trim().length === 0 ? (
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Only used when a max amount is set.
                  </p>
                ) : null}
                <div className="relative mt-1.5">
                  <select
                    value={periodIndex}
                    onChange={(e) => setPeriodIndex(Number(e.target.value))}
                    disabled={ruleType === "custom" && maxAmount.trim().length === 0}
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pr-10 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {PERIOD_OPTIONS.map((opt, i) => (
                      <option key={opt.seconds} value={i}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-xs text-rose-700">
              {(error as { shortMessage?: string }).shortMessage ||
                error.message}
            </p>
          </div>
        )}

        {/* Success */}
        {isConfirmed && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-medium text-emerald-700">
              Rule added successfully! Closing...
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
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
