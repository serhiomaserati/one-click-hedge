/**
 * Polymarket configuration — SERVER-SIDE ONLY.
 *
 * Do not import this from client components: it reads secret env vars.
 * Values come from .env.local (see .env.example for the template).
 */
import { Chain } from "@polymarket/clob-client";

export const POLYMARKET = {
  /** CLOB V2 API host. */
  clobHost: process.env.CLOB_HOST ?? "https://clob.polymarket.com",
  /** Polygon mainnet (137). Use Chain.AMOY (80002) for testnet. */
  chainId: Chain.POLYGON,
  /** bytes32 builder code — public attribution id for fee collection. */
  builderCode: process.env.BUILDER_CODE ?? "",
  /** Builder API address (public) from the builder profile. */
  builderApiAddress: process.env.BUILDER_API_ADDRESS ?? "",
  /** Builder fee in basis points charged on orders (launch default: 15 = 0.15%). */
  builderFeeBps: Number(process.env.BUILDER_FEE_BPS ?? "15"),
  /** Data API host for reading positions/activity. */
  dataApiHost: process.env.DATA_API_HOST ?? "https://data-api.polymarket.com",
  /** Polygon RPC for signing/allowance reads + approval txs. */
  polygonRpc: process.env.POLYGON_RPC ?? "https://polygon-bor-rpc.publicnode.com",
} as const;

/**
 * Builder API credentials (L2) used to sign builder headers.
 * Returns undefined until all three are set, so callers can degrade gracefully.
 */
export function getBuilderApiCreds():
  | { key: string; secret: string; passphrase: string }
  | undefined {
  const key = process.env.BUILDER_API_KEY;
  const secret = process.env.BUILDER_API_SECRET;
  const passphrase = process.env.BUILDER_API_PASSPHRASE;
  if (!key || !secret || !passphrase) return undefined;
  return { key, secret, passphrase };
}
