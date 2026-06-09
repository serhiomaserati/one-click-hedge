/**
 * Resolve a connected wallet to the address that actually holds Polymarket
 * positions — SERVER-SIDE ONLY.
 *
 * Polymarket users sign with their EOA but their funds and positions live under
 * a proxy: a Gnosis Safe for browser-wallet (MetaMask) users, or an EIP-1167
 * minimal proxy for Magic/email users. The Data API is keyed by that proxy, so
 * querying the bare EOA returns nothing. We derive both proxy candidates and use
 * whichever (EOA / Safe / proxy) actually has positions.
 */
import { deriveSafe, deriveProxyWallet } from "@polymarket/builder-relayer-client";
import { getPositions, type Position } from "./positions";

// Polymarket Polygon factories (from @polymarket/builder-relayer-client config).
const SAFE_FACTORY = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b";
const PROXY_FACTORY = "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052";

export type WalletKind = "eoa" | "safe" | "proxy" | "none";

export interface Resolved {
  address: string;
  kind: WalletKind;
  positions: Position[];
}

/** Derive both Polymarket proxy candidates for an EOA (no network calls). */
export function deriveProxyAddresses(eoa: string): { safe: string; proxy: string } {
  return {
    safe: deriveSafe(eoa, SAFE_FACTORY),
    proxy: deriveProxyWallet(eoa, PROXY_FACTORY),
  };
}

export async function resolveWithPositions(input: string): Promise<Resolved> {
  const candidates: { address: string; kind: WalletKind }[] = [
    { address: input, kind: "eoa" },
  ];
  try {
    candidates.push({ address: deriveSafe(input, SAFE_FACTORY), kind: "safe" });
  } catch {
    /* ignore derivation failure */
  }
  try {
    candidates.push({ address: deriveProxyWallet(input, PROXY_FACTORY), kind: "proxy" });
  } catch {
    /* ignore derivation failure */
  }

  const results = await Promise.all(
    candidates.map(async (c) => ({
      ...c,
      positions: await getPositions(c.address).catch(() => [] as Position[]),
    }))
  );

  // Priority: EOA first, then Safe, then Magic proxy (candidates order).
  const hit = results.find((r) => r.positions.length > 0);
  return hit ?? { address: input, kind: "none", positions: [] };
}
