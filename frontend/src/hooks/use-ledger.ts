"use client";

import { useAccount } from "wagmi";

/**
 * Detects whether the current wallet connection is through a Ledger device.
 * Covers Ledger Live (via WalletConnect / Connect Kit) and Ledger Extension.
 */
export function useLedger() {
  const { connector } = useAccount();
  const isLedger =
    connector?.name?.toLowerCase().includes("ledger") ?? false;

  return { isLedger };
}
