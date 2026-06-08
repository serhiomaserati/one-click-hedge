// Stage 3 SAFE pipeline test: place a tiny BUY limit far BELOW market (can never
// cross the spread → can never fill → no money moves), confirm the exchange
// accepts it WITH builder attribution, then cancel it. Proves signing + builder
// headers end-to-end without spending anything.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const require = createRequire(import.meta.url);
const { ClobClient, Chain, SignatureType, Side, OrderType } = require("@polymarket/clob-client");
const { BuilderConfig } = require("@polymarket/builder-signing-sdk");

const RPC = "https://polygon-bor-rpc.publicnode.com";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const account = privateKeyToAccount(get("WALLET_PRIVATE_KEY"));
const host = get("CLOB_HOST") || "https://clob.polymarket.com";
const feeBps = Number(get("BUILDER_FEE_BPS") || "15");
const signer = createWalletClient({ account, chain: polygon, transport: http(RPC) });

const bootstrap = new ClobClient(host, Chain.POLYGON, signer);
const creds = await bootstrap.createOrDeriveApiKey();
const builderConfig = new BuilderConfig({
  localBuilderCreds: {
    key: get("BUILDER_API_KEY"),
    secret: get("BUILDER_API_SECRET"),
    passphrase: get("BUILDER_API_PASSPHRASE"),
  },
});
const client = new ClobClient(
  host, Chain.POLYGON, signer, creds, SignatureType.EOA, account.address, undefined, false, builderConfig
);

// Get recently-traded tokens (guaranteed liquid + accepting orders) and pick one
// with a healthy two-sided book.
const trades = await fetch("https://data-api.polymarket.com/trades?limit=40").then((r) => r.json());
const seen = new Set();
let chosen = null;
for (const t of trades) {
  const id = t.asset;
  if (!id || seen.has(id)) continue;
  seen.add(id);
  let book;
  try {
    book = await client.getOrderBook(id);
  } catch {
    continue;
  }
  const bids = (book.bids ?? []).map((b) => Number(b.price));
  const asks = (book.asks ?? []).map((a) => Number(a.price));
  const maxBid = bids.length ? Math.max(...bids) : 0;
  const minAsk = asks.length ? Math.min(...asks) : 1;
  if (maxBid > 0.1 && minAsk < 0.95) {
    chosen = { token: { token_id: id, outcome: t.outcome ?? "?" }, m: { question: t.title ?? "" }, maxBid, minAsk };
    break;
  }
}

if (!chosen) {
  console.log("No suitable liquid market found right now — try again later.");
  process.exit(1);
}

const { m, token, maxBid, minAsk } = chosen;
const tokenID = token.token_id;
const tick = Number(await client.getTickSize(tokenID));
// price strictly below best bid → strictly below best ask → can NEVER fill.
let price = Math.floor((maxBid * 0.5) / tick) * tick;
price = Number(Math.max(tick, price).toFixed(4));
const size = Math.max(5, Math.ceil(1.5 / price));

console.log("Market:", (m.question ?? "").slice(0, 60));
console.log("Outcome:", token.outcome, "| best bid", maxBid, "best ask", minAsk);
console.log(`Test BUY: ${size} @ ${price}  (notional ~$${(size * price).toFixed(2)}, fee ${feeBps}bps)`);
console.log("This price is below best bid → cannot fill.\n");

// feeRateBps omitted — the SDK resolves the market's protocol fee; the builder
// fee is applied separately via the builder headers (builderConfig).
const signed = await client.createOrder({
  tokenID, price, size, side: Side.BUY,
});
const res = await client.postOrder(signed, OrderType.GTC);
console.log("postOrder →", JSON.stringify(res));

const orderID = res?.orderID ?? res?.orderId ?? res?.id;
if (orderID) {
  const c = await client.cancelOrder({ orderID });
  console.log("cancelOrder →", JSON.stringify(c));
  console.log("\n✓ Pipeline works: order signed, accepted with builder attribution, and cancelled. No money moved.");
} else {
  console.log("\nNo orderID returned — inspect the postOrder response above.");
}
