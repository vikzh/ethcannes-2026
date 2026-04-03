import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

/** Real WC project IDs are non-empty and not the old placeholder. */
const useWalletConnect =
  walletConnectProjectId.length > 0 &&
  walletConnectProjectId !== "00000000000000000000000000000000";

/**
 * Without a WalletConnect / Reown project ID we only register the injected
 * connector (MetaMask, Rabby, browser wallets). That avoids Reown’s origin
 * allowlist and the "localhost:3000 not found on Allowlist" console error.
 *
 * When `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, add your dev origin at
 * https://cloud.reown.com (e.g. `http://localhost:3000`) or use injected-only.
 */
export const wagmiConfig = useWalletConnect
  ? getDefaultConfig({
      appName: "Wallet Console",
      projectId: walletConnectProjectId,
      chains: [mainnet, sepolia],
      ssr: true,
    })
  : createConfig({
      chains: [mainnet, sepolia],
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
      },
      connectors: [injected({ shimDisconnect: true })],
      ssr: true,
    });
