import { NextResponse } from "next/server";
import { deriveProxyAddresses, resolveWithPositions } from "@/lib/polymarket/resolve";

/**
 * GET /api/proxy?address=0x...
 * Returns the Polymarket proxy addresses for an EOA, plus the one that actually
 * holds positions (so the browser can sign orders with the correct funder and
 * signature type). The funded address is authoritative; the derived ones are a
 * fallback for wallets with no positions yet.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Provide a valid wallet address: ?address=0x…" },
      { status: 400 }
    );
  }
  try {
    const derived = deriveProxyAddresses(address);
    const resolved = await resolveWithPositions(address).catch(() => null);
    return NextResponse.json({
      eoa: address,
      ...derived,
      // The address with positions + how it was derived ("safe" | "proxy" | …).
      funded: resolved && resolved.kind !== "none" ? resolved.address : null,
      fundedKind: resolved?.kind ?? "none",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
