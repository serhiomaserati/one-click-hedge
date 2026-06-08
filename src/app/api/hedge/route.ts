import { NextResponse } from "next/server";
import { getPositions } from "@/lib/polymarket/positions";
import { buildHedgeSuggestions } from "@/lib/polymarket/hedge";

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
    const positions = await getPositions(address);
    const suggestions = await buildHedgeSuggestions(positions);
    return NextResponse.json({
      address,
      count: positions.length,
      positions,
      suggestions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
