import { encodeFunctionData, isAddress, padHex, type Address, type Hex } from "viem";
import { POLICY_HOOK_ABI } from "./contracts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface PresetTransfer {
  /** ERC-20 token contract address. */
  token: string;
  /** Ticker symbol — display only. */
  symbol?: string;
  /** Decimal places — display only. */
  decimals?: number;
  /**
   * Allowed recipient address.
   * null = no restriction (any destination allowed).
   */
  destination: string | null;
  /** Max spend per period in the token's smallest unit (as a decimal string). */
  maxPerPeriod: string;
  /** Rolling window duration in seconds (as a decimal string). */
  periodDuration: string;
}

export interface Preset {
  version: "1";
  name: string;
  transfers: PresetTransfer[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class PresetParseError extends Error {}

export function parsePreset(raw: string): Preset {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new PresetParseError("Invalid JSON in preset text record.");
  }

  if (typeof obj !== "object" || obj === null) {
    throw new PresetParseError("Preset must be a JSON object.");
  }

  const p = obj as Record<string, unknown>;

  if (p.version !== "1") {
    throw new PresetParseError(`Unsupported preset version: ${String(p.version)}`);
  }
  if (typeof p.name !== "string" || !p.name) {
    throw new PresetParseError("Preset must have a non-empty name.");
  }
  if (!Array.isArray(p.transfers) || p.transfers.length === 0) {
    throw new PresetParseError("Preset must have at least one transfer entry.");
  }
  if (p.transfers.length > 10) {
    throw new PresetParseError("Preset may not have more than 10 transfer entries.");
  }

  for (let i = 0; i < p.transfers.length; i++) {
    const t = p.transfers[i] as Record<string, unknown>;
    if (!isAddress(String(t.token ?? ""))) {
      throw new PresetParseError(`transfers[${i}].token is not a valid address.`);
    }
    if (t.destination !== null && !isAddress(String(t.destination ?? ""))) {
      throw new PresetParseError(`transfers[${i}].destination must be an address or null.`);
    }
    if (typeof t.maxPerPeriod !== "string" || !/^\d+$/.test(t.maxPerPeriod)) {
      throw new PresetParseError(`transfers[${i}].maxPerPeriod must be a decimal string.`);
    }
    if (typeof t.periodDuration !== "string" || !/^\d+$/.test(t.periodDuration)) {
      throw new PresetParseError(`transfers[${i}].periodDuration must be a decimal string.`);
    }
  }

  return obj as Preset;
}

// ---------------------------------------------------------------------------
// Encoding — convert preset entries to addEqRuleWithSpend calldata
// ---------------------------------------------------------------------------

/** ERC-20 transfer(address,uint256) selector */
const TRANSFER_SELECTOR = "0xa9059cbb" as Hex;

/**
 * Encodes one preset transfer entry as calldata for:
 *   PolicyHookRuleSpend.addEqRuleWithSpend(target, selector, conditions[], spend)
 *
 * Mapping:
 *   target    = transfer.token
 *   selector  = 0xa9059cbb
 *   conditions = [] when destination is null
 *              = [{ paramIndex: 0, expectedValue: padded(destination) }] otherwise
 *   spend     = { spendParamIndex: 1, maxPerPeriod, periodDuration }
 */
export function encodeAddRuleCall(transfer: PresetTransfer): Hex {
  const conditions =
    transfer.destination !== null
      ? [
          {
            paramIndex: 0,   // transfer(address to, uint256 amount) — to is param index 0
            expectedValue: padHex(transfer.destination as Hex, { size: 32 }),
          },
        ]
      : [];

  return encodeFunctionData({
    abi: POLICY_HOOK_ABI,
    functionName: "addEqRuleWithSpend",
    args: [
      transfer.token as Address,
      TRANSFER_SELECTOR,
      conditions,
      {
        spendParamIndex: 1,
        maxPerPeriod: BigInt(transfer.maxPerPeriod),
        periodDuration: BigInt(transfer.periodDuration),
      },
    ],
  });
}

/** Returns an array of addEqRuleWithSpend calldata — one per transfer entry. */
export function presetToCalls(preset: Preset): Hex[] {
  return preset.transfers.map(encodeAddRuleCall);
}
