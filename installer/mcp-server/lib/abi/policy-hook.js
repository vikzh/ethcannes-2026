export const POLICY_HOOK_ABI = [
  {
    name: "isWhitelisted",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getSpendLimit",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "maxPerPeriod", type: "uint256" },
          { name: "periodDuration", type: "uint256" },
          { name: "spentInPeriod", type: "uint256" },
          { name: "periodStart", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getPolicy",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "nativeValueCapPerTx", type: "uint256" },
          { name: "paused", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "isInitialized",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "smartAccount", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
];
