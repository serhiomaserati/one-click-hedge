import { NextResponse } from "next/server";
import { getReadClient } from "@/lib/polymarket/client";
import { POLYMARKET } from "@/lib/polymarket/config";

/**
 * Health check: proves we can reach the Polymarket CLOB V2 API.
 * No credentials required — just pings getOk() and getServerTime().
 */
export async function GET() {
  try {
    const client = getReadClient();
    const [ok, serverTime] = await Promise.all([
      client.getOk(),
      client.getServerTime(),
    ]);

    return NextResponse.json({
      connected: true,
      ok,
      serverTime,
      clobHost: POLYMARKET.clobHost,
      chainId: POLYMARKET.chainId,
      builderCodeConfigured: POLYMARKET.builderCode.length > 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
