import { encodePacked, encodeAbiParameters, parseAbiParameters, type Address } from "viem";

// MODE_SINGLE = 0x00...00 (32 zero bytes)
export const MODE_SINGLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Encode a single execution for the IsolatedAccount.execute() call.
 * Layout: abi.encodePacked(address target, uint256 value, bytes callData)
 */
export function encodeSingle(
  target: Address,
  value: bigint,
  callData: `0x${string}`,
): `0x${string}` {
  return encodePacked(
    ["address", "uint256", "bytes"],
    [target, value, callData],
  );
}

// ---------- ABI fragments ----------

export const ISOLATED_ACCOUNT_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionCalldata", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const POLICY_HOOK_ABI = [
  {
    name: "addWhitelistEntry",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [],
  },
  {
    name: "removeWhitelistEntry",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [],
  },
  {
    name: "addEqRuleWithSpend",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      {
        name: "conditions",
        type: "tuple[]",
        components: [
          { name: "paramIndex", type: "uint8" },
          { name: "expectedValue", type: "bytes32" },
        ],
      },
      {
        name: "spend",
        type: "tuple",
        components: [
          { name: "spendParamIndex", type: "uint8" },
          { name: "maxPerPeriod", type: "uint256" },
          { name: "periodDuration", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "ruleId", type: "bytes32" }],
  },
  {
    name: "setSpendLimit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "maxPerPeriod", type: "uint256" },
      { name: "periodDuration", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

/** ERC-20 transfer(address,uint256) selector */
export const TRANSFER_SELECTOR = "0xa9059cbb" as const;

/** Encode an address as a bytes32 ABI word (left-padded with zeros) */
export function addressToBytes32(addr: Address): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("address"), [addr]) as `0x${string}`;
}

// ---------- Well-known Sepolia tokens ----------

export interface KnownToken {
  name: string;
  symbol: string;
  address: Address;
  decimals: number;
}

export const SEPOLIA_TOKENS: KnownToken[] = [
  { name: "USD Coin",          symbol: "USDC",  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6  },
  { name: "Tether USD",        symbol: "USDT",  address: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", decimals: 6  },
  { name: "Dai Stablecoin",    symbol: "DAI",   address: "0x68194a729C2450ad26072b3D33ADaCbcef39D574", decimals: 18 },
  { name: "Wrapped Ether",     symbol: "WETH",  address: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", decimals: 18 },
  { name: "Chainlink Token",   symbol: "LINK",  address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18 },
  { name: "Uniswap Token",     symbol: "UNI",   address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { name: "Aave Token",        symbol: "AAVE",  address: "0x5bB220AfC6e2E008Cb2302A83536a019eD245Aa2", decimals: 18 },
  { name: "Mock Token",        symbol: "MOCK",  address: "0xF29934Cc706e20DDA4ba265FDE0d69c2E35e3988", decimals: 18 },
];
