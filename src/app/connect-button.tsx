"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();

  if (!ready) {
    return (
      <button
        disabled
        className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium text-zinc-400 dark:border-white/15"
      >
        …
      </button>
    );
  }

  if (authenticated) {
    const label = address ? short(address) : user?.email?.address ?? "Account";
    return (
      <button
        onClick={logout}
        className="rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-1.5 font-mono text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={login}
      className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
    >
      Sign in
    </button>
  );
}
