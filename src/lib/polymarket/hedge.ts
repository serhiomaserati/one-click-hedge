/**
 * Hedge engine (Stage 2).
 *
 * The simplest, always-available hedge for a binary Polymarket position is to
 * buy the OTHER outcome of the same market. If you hold `size` shares of "Yes"
 * and buy `size` shares of "No", exactly one side pays $1 at resolution — so you
 * lock in `size` dollars no matter what. This neutralizes directional risk.
 *
 * We price the hedge from the live order book (cost to BUY the opposite outcome)
 * and rank suggestions by how much $ risk each one removes.
 */
import { getReadClient } from "./client";
import type { Position } from "./positions";

export interface HedgeSuggestion {
  position: Position;
  /** $ lost if this position resolves against you (≈ current value). */
  downsideRisk: number;
  /** tokenId of the opposite outcome to buy. */
  hedgeTokenId: string;
  /** e.g. "No" when you hold "Yes". */
  hedgeOutcome: string;
  /** Live ask price per share to buy the opposite outcome. */
  hedgePrice: number;
  /** Shares to buy for a full hedge (= position size). */
  hedgeSize: number;
  /** Cost of the full hedge. */
  hedgeCost: number;
  /** Guaranteed payout after a full hedge (one side pays $1 × size). */
  lockedValue: number;
  /** Locked P/L once hedged ≈ lockedValue − (already spent + hedge cost). */
  lockedPnl: number;
  /** True if the opposite ask is live; false means we fell back to 1 − curPrice. */
  livePrice: boolean;
}

/** Read the live BUY price for a token, falling back to (1 − curPrice). */
async function getHedgePrice(tokenId: string, curPrice: number): Promise<{ price: number; live: boolean }> {
  const fallback = Math.min(Math.max(1 - curPrice, 0.001), 0.999);
  try {
    const res = await getReadClient().getPrice(tokenId, "BUY");
    const raw = typeof res === "object" && res !== null ? (res.price ?? res) : res;
    const px = Number(raw);
    if (Number.isFinite(px) && px > 0 && px < 1) return { price: px, live: true };
  } catch {
    // ignore — use fallback
  }
  return { price: fallback, live: false };
}

/** Build hedge suggestions for a set of positions, biggest risk first. */
export async function buildHedgeSuggestions(positions: Position[]): Promise<HedgeSuggestion[]> {
  const suggestions = await Promise.all(
    positions
      .filter((p) => p.oppositeAsset && p.size > 0)
      .map(async (p): Promise<HedgeSuggestion> => {
        const { price, live } = await getHedgePrice(p.oppositeAsset, p.curPrice);
        const hedgeSize = p.size;
        const hedgeCost = hedgeSize * price;
        const lockedValue = hedgeSize; // one side pays $1 per share at resolution
        return {
          position: p,
          downsideRisk: p.currentValue,
          hedgeTokenId: p.oppositeAsset,
          hedgeOutcome: p.oppositeOutcome,
          hedgePrice: price,
          hedgeSize,
          hedgeCost,
          lockedValue,
          // Dollars in = initialValue (= size × avgPrice). NOTE: totalBought is a
          // SHARE count, not dollars — do not use it here.
          lockedPnl: lockedValue - (p.initialValue + hedgeCost),
          livePrice: live,
        };
      })
  );

  return suggestions.sort((a, b) => b.downsideRisk - a.downsideRisk);
}
