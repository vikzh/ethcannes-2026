import { base, baseSepolia, sepolia } from "viem/chains";

export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
export const AA_CHAIN_ID = parseInt(process.env.AA_CHAIN_ID || "11155111", 10);

const CHAIN_MAP = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [sepolia.id]: sepolia,
};

const DEFAULT_RPC = {
  [base.id]: "https://mainnet.base.org",
  [baseSepolia.id]: "https://sepolia.base.org",
  [sepolia.id]: "https://ethereum-sepolia-rpc.publicnode.com",
};

const EXPLORER_MAP = {
  [base.id]: "https://basescan.org",
  [baseSepolia.id]: "https://sepolia.basescan.org",
  [sepolia.id]: "https://sepolia.etherscan.io",
};

export const ACTIVE_CHAIN = CHAIN_MAP[AA_CHAIN_ID] || (FACTORY_ADDRESS ? sepolia : base);
export const ACTIVE_CHAIN_ID = ACTIVE_CHAIN.id;

export const RPC_URL =
  process.env.RPC_URL ||
  process.env.BASE_RPC_URL ||
  DEFAULT_RPC[ACTIVE_CHAIN_ID] ||
  "https://mainnet.base.org";

const EXPLORER_BASE = EXPLORER_MAP[ACTIVE_CHAIN_ID] || "https://basescan.org";

export function explorerTxUrl(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function explorerAddressUrl(addr) {
  return `${EXPLORER_BASE}/address/${addr}`;
}

export const TOKENS = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
};

export const PROTOCOLS = {
  UNISWAP_V3_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
  UNISWAP_V3_QUOTER: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  AAVE_V3_POOL: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  AAVE_V3_POOL_DATA_PROVIDER: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac",
};

const _decimalsRaw = {
  [TOKENS.WETH]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.USDbC]: 6,
  [TOKENS.USDT]: 6,
  [TOKENS.DAI]: 18,
  [TOKENS.cbETH]: 18,
  [TOKENS.wstETH]: 18,
};

export const TOKEN_DECIMALS = Object.fromEntries(
  Object.entries(_decimalsRaw).map(([k, v]) => [k.toLowerCase(), v])
);

export function getDecimals(tokenAddress) {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] ?? 18;
}
