/**
 * wagmi config — browser wallet connection on Polygon.
 *
 * Uses the injected connector (MetaMask / browser wallets) so no WalletConnect
 * project id is needed for the MVP. Orders are signed client-side by the user's
 * own wallet so Polymarket's geoblock applies per-user.
 */
import { http, createConfig } from "wagmi";
import { polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [injected()],
  transports: {
    [polygon.id]: http(),
  },
  ssr: true,
});
