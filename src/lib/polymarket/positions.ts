/**
 * Reading a user's Polymarket positions from the Data API (public, no auth).
 * Keyed by the user's wallet/proxy address.
 */
import { POLYMARKET } from "./config";

export interface Position {
  proxyWallet: string;
  /** tokenId of the outcome you currently hold. */
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  /** e.g. "Yes" / "No". */
  outcome: string;
  outcomeIndex: number;
  /** The other side of this market — the natural hedge target. */
  oppositeOutcome: string;
  /** tokenId of the opposing outcome — used directly when placing a hedge. */
  oppositeAsset: string;
}

/** Fetch open positions for an address, biggest exposure first. */
export async function getPositions(
  address: string,
  opts?: { sizeThreshold?: number }
): Promise<Position[]> {
  const url = new URL("/positions", POLYMARKET.dataApiHost);
  url.searchParams.set("user", address);
  url.searchParams.set("sizeThreshold", String(opts?.sizeThreshold ?? 1));
  url.searchParams.set("sortBy", "CURRENT");
  url.searchParams.set("sortDirection", "DESC");

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Data API /positions returned ${res.status}`);
  }
  return (await res.json()) as Position[];
}
