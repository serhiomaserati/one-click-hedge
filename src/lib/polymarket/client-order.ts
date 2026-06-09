/**
 * CLIENT-SIDE order placement (browser only).
 *
 * The user's own wagmi wallet signs and submits the order directly to Polymarket,
 * so the geoblock applies to the user's IP (the correct, ToS-compliant model).
 * Builder-fee attribution is done via remoteBuilderConfig → our /api/builder/sign
 * endpoint, so the builder secret never reaches the browser.
 */
import {
  ClobClient,
  Chain,
  SignatureType,
  Side,
  OrderType,
} from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import type { WalletClient } from "viem";

const HOST = "https://clob.polymarket.com";

export interface PlaceOrderArgs {
  walletClient: WalletClient;
  address: `0x${string}`;
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
 * with builder-fee attribution via the remote signer. Both the hedge button and
 * the "Open a position" panel route through here so every order counts toward
 * our builder code.
 */
export async function placeOrderFromBrowser(args: PlaceOrderArgs): Promise<HedgeResult> {
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: { url: `${window.location.origin}/api/builder/sign` },
  });

  try {
    // Derive L2 creds (this prompts one signature in the wallet).
    const bootstrap = new ClobClient(HOST, Chain.POLYGON, args.walletClient);
    const creds = await bootstrap.createOrDeriveApiKey();

    const client = new ClobClient(
      HOST,
      Chain.POLYGON,
      args.walletClient,
      creds,
      SignatureType.EOA,
      args.address,
      undefined,
      false,
      builderConfig
    );

    const signed = await client.createOrder({
      tokenID: args.tokenID,
      price: args.price,
      size: args.size,
      side: args.side === "SELL" ? Side.SELL : Side.BUY,
    });
    const res = await client.postOrder(signed, OrderType.GTC);

    // Polymarket returns { error, status } on geoblock / rejection.
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
