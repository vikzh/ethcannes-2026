import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  ledgerWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

/** Real WC project IDs are non-empty and not the old placeholder. */
const useWalletConnect =
  walletConnectProjectId.length > 0 &&
  walletConnectProjectId !== "00000000000000000000000000000000";

const sepoliaRpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() || undefined;

const chains = [sepolia] as const;
const transports = { [sepolia.id]: http(sepoliaRpcUrl) };

/**
 * When a WalletConnect project ID is available, we show the full wallet list
 * including Ledger, MetaMask, Coinbase, WalletConnect, and browser wallets.
 * Ledger connects via Ledger Live through the WalletConnect protocol.
 *
 * Without a project ID we fall back to injected-only (browser extensions).
 */
const connectors = useWalletConnect
  ? connectorsForWallets(
      [
        {
          groupName: "Popular",
          wallets: [
            metaMaskWallet,
            ledgerWallet,
            coinbaseWallet,
            walletConnectWallet,
          ],
        },
        {
          groupName: "Other",
          wallets: [injectedWallet],
        },
      ],
      {
        appName: "Wallet Console",
        projectId: walletConnectProjectId,
      }
    )
  : [injected({ shimDisconnect: true })];

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors,
  ssr: true,
});
