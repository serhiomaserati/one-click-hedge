/**
 * Polymarket configuration — SERVER-SIDE ONLY.
 *
 * Do not import this from client components: it reads server env vars.
 * Values come from .env.local (see .env.example for the template).
 *
 * On CLOB V2 the ClobClient resolves the exchange / collateral (pUSD) contract
 * addresses itself from the chain id, so we no longer hardcode them here.
 */
import { Chain } from "@polymarket/clob-client-v2";

export const POLYMARKET = {
  /** CLOB API host (same host for V2; the backend handles versioning). */
  clobHost: process.env.CLOB_HOST ?? "https://clob.polymarket.com",
  /** Polygon mainnet (137). */
  chainId: Chain.POLYGON,
  /** bytes32 builder code — public attribution id for fee collection. */
  builderCode: process.env.BUILDER_CODE ?? "",
  /** Data API host for reading positions/activity. */
  dataApiHost: process.env.DATA_API_HOST ?? "https://data-api.polymarket.com",
  /** Polygon RPC for proxy/allowance reads. */
  polygonRpc: process.env.POLYGON_RPC ?? "https://polygon-bor-rpc.publicnode.com",
} as const;
