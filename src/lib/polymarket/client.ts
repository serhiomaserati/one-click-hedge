/**
 * ClobClient factory — SERVER-SIDE ONLY (CLOB V2).
 *
 * Only the read-only client lives here (no credentials needed): markets, order
 * books, prices, health. Order placement happens CLIENT-SIDE in the browser
 * with the user's own wallet — see src/lib/polymarket/client-order.ts.
 */
import { ClobClient } from "@polymarket/clob-client-v2";
import { POLYMARKET } from "./config";

let readClient: ClobClient | null = null;

/** Credential-free V2 client for public reads (markets, books, prices, health). */
export function getReadClient(): ClobClient {
  if (!readClient) {
    readClient = new ClobClient({
      host: POLYMARKET.clobHost,
      chain: POLYMARKET.chainId,
    });
  }
  return readClient;
}
