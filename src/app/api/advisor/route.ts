import { NextResponse } from "next/server";
import { getPositions } from "@/lib/polymarket/positions";
import { buildHedgeSuggestions } from "@/lib/polymarket/hedge";
import { getPortfolioAdvice, isAdvisorEnabled } from "@/lib/ai/advisor";

/**
 * GET /api/advisor?address=0x...
 * Returns a Claude-generated risk read for the address's portfolio.
 * If ANTHROPIC_API_KEY is unset, responds { enabled: false } and the UI hides the panel.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Provide a valid wallet address: ?address=0x…" },
      { status: 400 }
    );
  }

  if (!isAdvisorEnabled()) {
    return NextResponse.json({ enabled: false, advice: null });
  }

  try {
    const positions = await getPositions(address);
    if (positions.length === 0) {
      return NextResponse.json({ enabled: true, advice: null });
    }
    const suggestions = await buildHedgeSuggestions(positions);
    const advice = await getPortfolioAdvice(positions, suggestions);
    return NextResponse.json({ enabled: true, advice });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
