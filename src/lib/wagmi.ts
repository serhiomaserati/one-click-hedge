/**
 * wagmi config for Privy — browser wallet + Magic-style email login on Polygon.
 *
 * Privy manages the connectors (external wallets + embedded wallets for email
 * users), so we don't declare connectors here. Our existing hooks (useAccount,
 * useWalletClient) keep working — orders are still signed client-side by the
 * user's wallet, so Polymarket's geoblock applies per-user.
 */
import { http } from "wagmi";
import { polygon } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";

export const wagmiConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
});
