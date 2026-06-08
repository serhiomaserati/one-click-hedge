/**
 * Order placement (Stage 3) — SERVER-SIDE ONLY.
 *
 * Builder attribution is automatic: the authed client carries a BuilderConfig,
 * so postOrder() injects the builder headers and the fee routes to the builder.
 */
import { Side, OrderType } from "@polymarket/clob-client";
import { getAuthedClient } from "./authed";

export interface PlaceBuyParams {
  tokenID: string;
  /** Limit price per share (0–1), aligned to the market tick size. */
  price: number;
  /** Number of outcome shares to buy. */
  size: number;
  orderType?: OrderType;
}

/** Place a BUY limit order for an outcome token (the hedge leg). */
export async function placeBuy(params: PlaceBuyParams) {
  const { client } = await getAuthedClient();
  // feeRateBps omitted — SDK resolves the market protocol fee; the builder fee
  // routes via builder headers (builderConfig) + the builder profile setting.
  const signed = await client.createOrder({
    tokenID: params.tokenID,
    price: params.price,
    size: params.size,
    side: Side.BUY,
  });
  return client.postOrder(signed, params.orderType ?? OrderType.GTC);
}

/** Cancel a resting order by id. */
export async function cancelOrder(orderID: string) {
  const { client } = await getAuthedClient();
  return client.cancelOrder({ orderID });
}
