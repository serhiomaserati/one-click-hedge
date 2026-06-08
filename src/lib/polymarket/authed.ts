/**
 * Authenticated ClobClient (Stage 3) — SERVER-SIDE ONLY.
 *
 * Builds a CLOB client that can sign and place orders as the configured wallet,
 * with builder-code attribution attached so fees route to the builder.
 *
 * Flow:
 *  1. viem WalletClient from WALLET_PRIVATE_KEY signs orders (EOA).
 *  2. createOrDeriveApiKey() derives the trader's L2 creds from that signature.
 *  3. BuilderConfig (builder L2 creds) signs the builder headers for attribution.
 */
import { ClobClient, SignatureType } from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { POLYMARKET, getBuilderApiCreds } from "./config";

function getWallet(): { signer: WalletClient; address: `0x${string}` } {
  const pk = process.env.WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("WALLET_PRIVATE_KEY not set in .env.local");
  const account = privateKeyToAccount(pk);
  const signer = createWalletClient({
    account,
    chain: polygon,
    transport: http(POLYMARKET.polygonRpc),
  });
  return { signer, address: account.address };
}

/** BuilderConfig for fee attribution, or undefined if builder creds are absent. */
export function getBuilderConfig(): BuilderConfig | undefined {
  const creds = getBuilderApiCreds();
  if (!creds) return undefined;
  return new BuilderConfig({ localBuilderCreds: creds });
}

export interface AuthedClient {
  client: ClobClient;
  /** The trader EOA that signs orders and holds collateral. */
  address: `0x${string}`;
}

/** Build an authenticated client (derives L2 creds on the fly). */
export async function getAuthedClient(): Promise<AuthedClient> {
  const { signer, address } = getWallet();

  // L1-only bootstrap to derive the trader's L2 API credentials.
  const bootstrap = new ClobClient(POLYMARKET.clobHost, POLYMARKET.chainId, signer);
  const creds = await bootstrap.createOrDeriveApiKey();

  // Full client: L2 creds + EOA signing + builder attribution.
  const client = new ClobClient(
    POLYMARKET.clobHost,
    POLYMARKET.chainId,
    signer,
    creds,
    SignatureType.EOA,
    address, // funder = the EOA itself (holds USDC.e)
    undefined,
    false,
    getBuilderConfig()
  );

  return { client, address };
}
