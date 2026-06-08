// Stage 3 pre-flight: prove the wallet can authenticate, the builder config is
// valid, and report USDC.e allowances. Does NOT place any order. No money spent.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const { ClobClient, Chain, getContractConfig } = require("@polymarket/clob-client");
const { BuilderConfig } = require("@polymarket/builder-signing-sdk");

const RPC = "https://polygon-bor-rpc.publicnode.com";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const pk = get("WALLET_PRIVATE_KEY");
const host = get("CLOB_HOST") || "https://clob.polymarket.com";
const account = privateKeyToAccount(pk);
const signer = createWalletClient({ account, chain: polygon, transport: http(RPC) });
console.log("Trader EOA:", account.address);

// 1. Derive L2 creds (signature only — proves wallet auth against Polymarket).
const bootstrap = new ClobClient(host, Chain.POLYGON, signer);
let creds;
try {
  creds = await bootstrap.createOrDeriveApiKey();
  console.log("✓ L2 API creds derived (key:", creds.key.slice(0, 8) + "…)");
} catch (e) {
  console.log("✗ createOrDeriveApiKey FAILED:", e.message);
  process.exit(1);
}

// 2. Builder config validity.
const bc = new BuilderConfig({
  localBuilderCreds: {
    key: get("BUILDER_API_KEY"),
    secret: get("BUILDER_API_SECRET"),
    passphrase: get("BUILDER_API_PASSPHRASE"),
  },
});
console.log("✓ BuilderConfig valid:", bc.isValid(), "| type:", bc.getBuilderType());

// 3. USDC.e allowances toward the exchange contracts.
const cfg = getContractConfig(137);
const provider = new ethers.JsonRpcProvider(RPC);
const usdce = new ethers.Contract(
  cfg.collateral.toLowerCase(),
  ["function allowance(address,address) view returns (uint256)"],
  provider
);
console.log("Collateral (USDC.e):", cfg.collateral);
for (const [name, spender] of [
  ["exchange", cfg.exchange],
  ["negRiskExchange", cfg.negRiskExchange],
  ["negRiskAdapter", cfg.negRiskAdapter],
]) {
  const a = await usdce.allowance(account.address, spender.toLowerCase());
  console.log(`  allowance → ${name}:`, ethers.formatUnits(a, 6));
}
console.log("\nDone. (No order placed.)");
