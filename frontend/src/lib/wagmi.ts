import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  walletConnectWallet,
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

/**
 * With a WalletConnect project ID we register the full wallet list including
 * Ledger hardware wallet (via Ledger Connect Kit / WalletConnect). Ledger
 * appears first so users see it as the recommended trust layer.
 *
 * Without a project ID we fall back to injected-only (MetaMask, Rabby,
 * Ledger Extension, or any other browser wallet).
 */
export const wagmiConfig = useWalletConnect
  ? createConfig({
      connectors: connectorsForWallets(
        [
          {
            groupName: "Hardware Wallets",
            wallets: [ledgerWallet],
          },
          {
            groupName: "Software Wallets",
            wallets: [
              metaMaskWallet,
              coinbaseWallet,
              walletConnectWallet,
              injectedWallet,
            ],
          },
        ],
        {
          appName: "Wallet Console",
          projectId: walletConnectProjectId,
        },
      ),
      chains: [sepolia],
      transports: {
        [sepolia.id]: http(sepoliaRpcUrl),
      },
      ssr: true,
    })
  : createConfig({
      chains: [sepolia],
      transports: {
        [sepolia.id]: http(sepoliaRpcUrl),
      },
      connectors: [injected({ shimDisconnect: true })],
      ssr: true,
    });
