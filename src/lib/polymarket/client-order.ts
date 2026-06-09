/**
 * CLIENT-SIDE order placement (browser only) — CLOB V2.
 *
 * The user's own wagmi wallet signs and submits the order directly to Polymarket,
 * so the geoblock applies to the user's IP (the correct, ToS-compliant model).
 *
 * On V2 builder attribution is NATIVE: the public `builderCode` (bytes32) goes
 * straight into the order's `builder` field — no remote signer, no secret. So
 * this runs entirely in the browser.
 */
import {
  ClobClient,
  Chain,
  SignatureTypeV2,
  Side,
  OrderType,
} from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";

const HOST = "https://clob.polymarket.com";

// Public builder-code attribution id (safe in the browser).
const BUILDER_CODE =
  process.env.NEXT_PUBLIC_BUILDER_CODE ??
  "0x8be51911f257f57dd726ae2dab5cf8aa02c82318ebf537d3ce9783f8a74cc9ea";

export interface PlaceOrderArgs {
  walletClient: WalletClient;
  /** The EOA that signs (the connected wallet). */
  address: `0x${string}`;
  /**
   * The maker/funder address — the Polymarket wallet that holds the collateral
   * (Gnosis Safe / proxy / deposit wallet). Polymarket rejects raw-EOA makers,
   * so this must be the user's proxy. Defaults to `address` only as a fallback.
   */
  funder?: string;
  /** 2 = Gnosis Safe, 1 = Polymarket proxy, 3 = smart-contract (deposit) wallet. */
  signatureType?: SignatureTypeV2;
  tokenID: string;
  /** Limit price (use the live ask/bid to fill immediately). */
  price: number;
  size: number;
  /** BUY to open/hedge, SELL to close. Defaults to BUY. */
  side?: "BUY" | "SELL";
}

/** @deprecated use PlaceOrderArgs — kept for the hedge call sites. */
export type PlaceHedgeArgs = PlaceOrderArgs;

export type HedgeResult =
  | { ok: true; orderID: string; raw: unknown }
  | { ok: false; geoblocked: boolean; message: string };

/**
 * Place any order (BUY or SELL) from the browser through the user's wallet,
 * attributing it to our builder code. Both the hedge button and the
 * "Open a position" panel route through here so every order counts.
 */
export async function placeOrderFromBrowser(args: PlaceOrderArgs): Promise<HedgeResult> {
  try {
    // Derive L2 creds (this prompts one signature in the wallet).
    const bootstrap = new ClobClient({
      host: HOST,
      chain: Chain.POLYGON,
      signer: args.walletClient,
    });
    const creds = await bootstrap.createOrDeriveApiKey();

    const client = new ClobClient({
      host: HOST,
      chain: Chain.POLYGON,
      signer: args.walletClient,
      creds,
      signatureType: args.signatureType ?? SignatureTypeV2.POLY_GNOSIS_SAFE,
      funderAddress: args.funder ?? args.address,
      builderConfig: { builderCode: BUILDER_CODE },
    });

    const res = await client.createAndPostOrder(
      {
        tokenID: args.tokenID,
        price: args.price,
        size: args.size,
        side: args.side === "SELL" ? Side.SELL : Side.BUY,
        builderCode: BUILDER_CODE,
      },
      undefined,
      OrderType.GTC
    );

    // Polymarket returns { error, ... } on geoblock / rejection.
    if (res && typeof res === "object" && "error" in res) {
      const message = String((res as { error: unknown }).error);
      return { ok: false, geoblocked: isGeoblock(message), message };
    }

    const orderID =
      (res as { orderID?: string; orderId?: string; id?: string })?.orderID ??
      (res as { orderId?: string })?.orderId ??
      (res as { id?: string })?.id ??
      "";
    return { ok: true, orderID, raw: res };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, geoblocked: isGeoblock(message), message };
  }
}

/** Hedge button entry point — places the opposite-side BUY. */
export function placeHedgeFromBrowser(args: PlaceOrderArgs): Promise<HedgeResult> {
  return placeOrderFromBrowser({ ...args, side: "BUY" });
}

function isGeoblock(message: string): boolean {
  return /geoblock|region|restricted/i.test(message);
}
