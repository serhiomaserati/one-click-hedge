import { NextResponse } from "next/server";
import { getBuilderConfig } from "@/lib/polymarket/authed";

/**
 * POST /api/builder/sign
 * Remote builder-header signer for client-side order placement.
 *
 * The user's browser signs + submits the order itself (so Polymarket's geoblock
 * applies to the user's own IP). For fee attribution it needs builder headers,
 * which require the builder SECRET — that must never reach the browser. So the
 * browser's BuilderConfig is configured with remoteBuilderConfig pointing here,
 * and this endpoint signs the headers server-side and returns them.
 *
 * Body: { method, path, body?, timestamp? } — the SDK sends exactly this shape.
 * Returns: the POLY_BUILDER_* header payload.
 */
export async function POST(req: Request) {
  const token = process.env.BUILDER_REMOTE_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const bc = getBuilderConfig();
  if (!bc) {
    return NextResponse.json({ error: "builder creds not configured" }, { status: 503 });
  }

  try {
    const { method, path, body, timestamp } = await req.json();
    if (!method || !path) {
      return NextResponse.json({ error: "method and path are required" }, { status: 400 });
    }
    const headers = await bc.generateBuilderHeaders(method, path, body, timestamp);
    if (!headers) {
      return NextResponse.json({ error: "failed to sign builder headers" }, { status: 500 });
    }
    return NextResponse.json(headers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
