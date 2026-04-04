export const AGENT_SESSION_ABI = [
  {
    name: "getSession",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        name: "session",
        type: "tuple",
        components: [
          { name: "agentKey", type: "address" },
          { name: "validAfter", type: "uint48" },
          { name: "validUntil", type: "uint48" },
          { name: "nonce", type: "uint256" },
          { name: "revoked", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "hasActiveSession",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
];
