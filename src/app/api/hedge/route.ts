import { NextResponse } from "next/server";
import { buildHedgeSuggestions, analyzePortfolio } from "@/lib/polymarket/hedge";
import { resolveWithPositions } from "@/lib/polymarket/resolve";

/**
 * GET /api/hedge?address=0x...
 * Returns the address's open positions plus a hedge suggestion for each.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Provide a valid wallet address: ?address=0x… (40 hex chars)" },
      { status: 400 }
    );
  }

  try {
    const { address: resolved, kind, positions } = await resolveWithPositions(address);
    const suggestions = await buildHedgeSuggestions(positions);
    const portfolio = analyzePortfolio(positions);
    return NextResponse.json({
      address: resolved,
      requested: address,
      kind,
      count: positions.length,
      positions,
      suggestions,
      portfolio,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
