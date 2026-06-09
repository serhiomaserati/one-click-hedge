/**
 * Market lookup — SERVER-SIDE ONLY.
 *
 * Resolves a Polymarket market from a URL or slug (via the public Gamma API)
 * into its two outcome tokens, each priced with the live order-book ask so the
 * "Open a position" panel can place an immediately-fillable BUY.
 */
import { getReadClient } from "./client";

export interface MarketToken {
  outcome: string;
  tokenId: string;
  /** Live BUY (ask) price from the order book; falls back to the Gamma price. */
  price: number;
  /** Whether `price` came from the live order book. */
  live: boolean;
}

export interface ResolvedMarket {
  question: string;
  slug: string;
  image: string;
  conditionId: string;
  acceptingOrders: boolean;
  tokens: MarketToken[];
}

const GAMMA = process.env.GAMMA_API_HOST ?? "https://gamma-api.polymarket.com";

/** Pull a slug out of a full Polymarket URL, or return the input unchanged. */
export function extractSlug(input: string): string {
  const q = input.trim();
  if (!q.includes("/")) return q;
  try {
    const url = new URL(q.startsWith("http") ? q : `https://${q}`);
    const segs = url.pathname.split("/").filter(Boolean);
    return segs[segs.length - 1] ?? q;
  } catch {
    return q.split("/").filter(Boolean).pop() ?? q;
  }
}

/** Parse a Gamma JSON-string field (e.g. outcomes) into a string array. */
function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function livePrice(tokenId: string, gammaPrice: number): Promise<{ price: number; live: boolean }> {
  try {
    const res = await getReadClient().getPrice(tokenId, "BUY");
    const raw = typeof res === "object" && res !== null ? (res.price ?? res) : res;
    const px = Number(raw);
    if (Number.isFinite(px) && px > 0 && px < 1) return { price: px, live: true };
  } catch {
    // ignore — fall back to the Gamma price
  }
  const fb = Math.min(Math.max(gammaPrice, 0.001), 0.999);
  return { price: fb, live: false };
}

export async function resolveMarket(query: string): Promise<ResolvedMarket | null> {
  const slug = extractSlug(query);
  if (!slug) return null;

  const res = await fetch(
    `${GAMMA}/markets?slug=${encodeURIComponent(slug)}&closed=false`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Gamma API ${res.status}`);
  const list = (await res.json()) as Record<string, unknown>[];
  const m = Array.isArray(list) ? list[0] : null;
  if (!m) return null;

  const outcomes = parseList(m.outcomes);
  const tokenIds = parseList(m.clobTokenIds);
  const prices = parseList(m.outcomePrices).map(Number);

  const tokens = await Promise.all(
    tokenIds.map(async (tokenId, i) => {
      const { price, live } = await livePrice(tokenId, prices[i] ?? 0.5);
      return { outcome: outcomes[i] ?? `Outcome ${i + 1}`, tokenId, price, live };
    })
  );

  return {
    question: String(m.question ?? slug),
    slug: String(m.slug ?? slug),
    image: String(m.image ?? m.icon ?? ""),
    conditionId: String(m.conditionId ?? ""),
    acceptingOrders: m.acceptingOrders !== false && m.enableOrderBook !== false,
    tokens: tokens.filter((t) => t.tokenId),
  };
}
