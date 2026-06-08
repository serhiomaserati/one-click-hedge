/**
 * ClobClient factories — SERVER-SIDE ONLY.
 *
 * Stage 0 only wires the read-only client (no credentials needed), which is
 * enough to read markets, order books and prices, and to health-check the API.
 *
 * The authenticated client (signing + order placement with builder attribution)
 * is added in Stage 3, once wallet signing is in place. See getAuthedClient().
 */
import { ClobClient } from "@polymarket/clob-client";
import { POLYMARKET } from "./config";

let readClient: ClobClient | null = null;

/** Credential-free client for public reads (markets, books, prices, health). */
export function getReadClient(): ClobClient {
  if (!readClient) {
    readClient = new ClobClient(POLYMARKET.clobHost, POLYMARKET.chainId);
  }
  return readClient;
}

/**
 * Authenticated client for placing orders with builder-code attribution.
 *
 * TODO (Stage 3): build this with a viem WalletClient signer + L2 ApiKeyCreds +
 * BuilderConfig, verified against Polymarket's official builder example repos.
 * Throws for now so nothing silently places orders without attribution.
 */
export function getAuthedClient(): never {
  throw new Error(
    "getAuthedClient() is not implemented yet — wired up in Stage 3 (order placement)."
  );
}
