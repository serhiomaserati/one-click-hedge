import { NextResponse } from "next/server";
import { deriveProxyAddresses } from "@/lib/polymarket/resolve";

/**
 * GET /api/proxy?address=0x...
 * Returns the Polymarket proxy addresses (Gnosis Safe + EIP-1167) for an EOA,
 * so the browser can sign orders with the correct funder/signature type.
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
    return NextResponse.json({ eoa: address, ...deriveProxyAddresses(address) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
