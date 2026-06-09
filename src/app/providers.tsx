"use client";

import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { polygon } from "wagmi/chains";
import { wagmiConfig } from "@/lib/wagmi";

// App ID is public (used in the browser). Env override falls back to the literal.
const PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmq5wjgcv00940cjr6pvk4ehi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon],
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "light", accentColor: "#059669" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
