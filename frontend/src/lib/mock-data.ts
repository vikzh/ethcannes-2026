export const MOCK_WALLET_NAME = "demo-wallet";
export const MOCK_ADDRESS = "0x621c7a3e8f9b2d4e5a6c7b8d9e0f1a2b3c4d5e6";

/** Shown when disconnected or as a labeled demo balance in the sidebar */
export const MOCK_BALANCE_ETH = "2.4581";

export type MockTx = {
  id: string;
  direction: "in" | "out";
  status: "success" | "failed";
  date: string;
  amount: string;
  label: string;
};

export const MOCK_TRANSACTIONS: MockTx[] = [
  {
    id: "tx-1",
    direction: "in",
    status: "success",
    date: "2026-04-02T09:14:00.000Z",
    amount: "+0.42 ETH",
    label: "Bridge in",
  },
  {
    id: "tx-2",
    direction: "out",
    status: "success",
    date: "2026-04-01T18:40:00.000Z",
    amount: "-0.05 ETH",
    label: "Contract call",
  },
  {
    id: "tx-3",
    direction: "out",
    status: "failed",
    date: "2026-03-30T11:02:00.000Z",
    amount: "-1.00 ETH",
    label: "Swap (reverted)",
  },
  {
    id: "tx-4",
    direction: "in",
    status: "success",
    date: "2026-03-28T07:55:00.000Z",
    amount: "+0.12 ETH",
    label: "Received",
  },
];

export type MockPermission = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export const MOCK_PERMISSIONS: MockPermission[] = [
  {
    id: "sign-tx",
    label: "Sign transactions",
    description: "Propose and confirm on-chain actions for this Safe.",
    enabled: true,
  },
  {
    id: "view-assets",
    label: "View assets & balances",
    description: "Read token holdings and history.",
    enabled: true,
  },
  {
    id: "manage-modules",
    label: "Manage modules",
    description: "Install or remove optional modules.",
    enabled: false,
  },
  {
    id: "export-data",
    label: "Export transaction data",
    description: "Download CSV / API snapshots.",
    enabled: true,
  },
];
