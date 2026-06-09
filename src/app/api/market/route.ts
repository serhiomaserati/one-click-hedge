import { NextResponse } from "next/server";
import { resolveMarket } from "@/lib/polymarket/market";

/**
 * GET /api/market?q=<polymarket url or market slug>
 * Resolves a market into its outcome tokens with live BUY prices, so the
 * "Open a position" panel can place an immediately-fillable order.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json(
      { error: "Provide a market URL or slug: ?q=…" },
      { status: 400 }
    );
  }

  try {
    const market = await resolveMarket(q);
    if (!market) {
      return NextResponse.json(
        { error: "Market not found. Paste a Polymarket market URL or its slug." },
        { status: 404 }
      );
    }
    return NextResponse.json(market);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
