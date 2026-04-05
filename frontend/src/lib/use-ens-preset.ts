"use client";

import { normalize } from "viem/ens";
import { useEnsText } from "wagmi";
import { sepolia } from "viem/chains";
import { parsePreset, PresetParseError, type Preset } from "./preset";

function tryNormalize(name: string): string | undefined {
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "Request failed while reading ENS text record.";
  const e = err as { shortMessage?: string; message?: string };
  return e.shortMessage ?? e.message ?? "Request failed while reading ENS text record.";
}

interface UseEnsPresetResult {
  preset: Preset | null;
  isLoading: boolean;
  /** Human-readable error — either resolution or parse failure. */
  error: string | null;
}

/**
 * Resolves an ENS name and reads the requested text record key.
 * Parses and validates the JSON preset schema.
 *
 * Returns { preset: null, error } when the name doesn't resolve,
 * the record is missing, or the JSON is invalid.
 */
export function useEnsPreset(
  ensName: string,
  textRecordKey: string,
  chainId?: number,
): UseEnsPresetResult {
  const normalized = tryNormalize(ensName.trim());
  const normalizedKey = textRecordKey.trim();
  const targetChainId = chainId ?? sepolia.id;
  const canQuery = !!normalized && normalizedKey.length > 0;
  const queryKey = normalizedKey || "agent.preset";
  const legacyQueryEnabled = normalizedKey === "agent.preset";

  const {
    data: raw,
    isLoading: isPrimaryLoading,
    isFetched: isPrimaryFetched,
    isError: isPrimaryError,
    error: primaryError,
  } = useEnsText({
    name: normalized,
    key: queryKey,
    chainId: targetChainId,
    query: { enabled: canQuery },
  });

  const {
    data: rawLegacy,
    isLoading: isLegacyLoading,
    isFetched: isLegacyFetched,
    isError: isLegacyError,
    error: legacyError,
  } = useEnsText({
    name: normalized,
    key: " agent.preset",
    chainId: targetChainId,
    query: { enabled: canQuery && legacyQueryEnabled },
  });

  const effectiveRaw = raw ?? rawLegacy;
  const isLoading = isPrimaryLoading || isLegacyLoading;
  const isFetched = isPrimaryFetched && (!legacyQueryEnabled || isLegacyFetched);

  if (!normalized) {
    return { preset: null, isLoading: false, error: null };
  }

  if (!normalizedKey) {
    return { preset: null, isLoading: false, error: "Text record key is required." };
  }

  if (isLoading) {
    return { preset: null, isLoading: true, error: null };
  }

  if (isPrimaryError || isLegacyError) {
    const message = extractErrorMessage(primaryError ?? legacyError);
    return {
      preset: null,
      isLoading: false,
      error: `ENS lookup failed on chain ${targetChainId}: ${message}`,
    };
  }

  if (isFetched && !effectiveRaw) {
    return {
      preset: null,
      isLoading: false,
      error: `No "${normalizedKey}" text record found on ${normalized}`,
    };
  }

  if (!effectiveRaw) {
    return { preset: null, isLoading: false, error: null };
  }

  try {
    const preset = parsePreset(effectiveRaw);
    return { preset, isLoading: false, error: null };
  } catch (err) {
    const msg = err instanceof PresetParseError ? err.message : "Failed to parse preset JSON.";
    return { preset: null, isLoading: false, error: msg };
  }
}
