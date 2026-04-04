/**
 * Test helpers for Playwright e2e tests.
 *
 * Uses viem to derive a wallet from TEST_MNEMONIC, create a WalletClient
 * on Sepolia, and generate fresh random agent addresses per test run.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC_URL =
  process.env.TEST_RPC_URL ||
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
  "https://rpc.sepolia.org";

const MNEMONIC = process.env.TEST_MNEMONIC;

/**
 * Get the owner account derived from the test mnemonic.
 * Throws if TEST_MNEMONIC is not set.
 */
export function getOwnerAccount() {
  if (!MNEMONIC) {
    throw new Error(
      "TEST_MNEMONIC env var is required. Set it in frontend/.env",
    );
  }
  return mnemonicToAccount(MNEMONIC);
}

/** Owner address derived from TEST_MNEMONIC */
export function getOwnerAddress(): Address {
  return getOwnerAccount().address;
}

/** Create a viem WalletClient connected to Sepolia with the test mnemonic account. */
export function getWalletClient(): WalletClient {
  return createWalletClient({
    account: getOwnerAccount(),
    chain: sepolia,
    transport: http(RPC_URL),
  });
}

/** Create a viem PublicClient connected to Sepolia. */
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
}

/** Generate a random valid Ethereum address (for use as agent address in tests). */
export function generateAgentAddress(): Address {
  // Generate 32 random bytes as a hex string private key
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const account = privateKeyToAccount(`0x${hex}`);
  return account.address;
}

/** Check ETH balance of an address on Sepolia. */
export async function getBalance(address: Address): Promise<bigint> {
  const client = getPublicClient();
  return client.getBalance({ address });
}
