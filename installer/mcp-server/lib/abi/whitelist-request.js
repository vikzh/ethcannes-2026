export const WHITELIST_REQUEST_ABI = [
  {
    name: "requestWhitelistAddition",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      { name: "metadata", type: "string" },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  {
    name: "cancelRequest",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getRequest",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "requestId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "requestId", type: "uint256" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "metadata", type: "string" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getPendingRequests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "requestId", type: "uint256" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "metadata", type: "string" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getNextRequestId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const REQUEST_STATUS = ["Pending", "Approved", "Rejected", "Cancelled"];
