"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { SignatureTypeV2 } from "@polymarket/clob-client-v2";
import { placeHedgeFromBrowser, placeOrderFromBrowser } from "@/lib/polymarket/client-order";
import { recordTrade, getSecuredSummary, TRADE_EVENT } from "@/lib/track";
import { track } from "@vercel/analytics";

/** The Polymarket proxy that holds funds + how to sign for it. */
interface TradeIdentity {
  funder: string;
  signatureType: SignatureTypeV2;
}

interface Position {
  conditionId: string;
  asset: string;
  title: string;
  outcome: string;
  size: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
  icon: string;
  slug: string;
}

interface HedgeSuggestion {
  position: Position;
  downsideRisk: number;
  hedgeTokenId: string;
  hedgeOutcome: string;
  hedgePrice: number;
  hedgeSize: number;
  hedgeCost: number;
  lockedValue: number;
  lockedPnl: number;
  lockedPnlPct: number;
  worthHedging: boolean;
  livePrice: boolean;
  alreadyHedged: boolean;
}

interface PortfolioInsight {
  totalValue: number;
  eventCount: number;
  alreadyHedgedCount: number;
  topEvent?: { title: string; value: number; share: number; positions: number };
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      address: string;
      kind: string;
      cash: number;
      positions: Position[];
      suggestions: HedgeSuggestion[];
      portfolio: PortfolioInsight;
    };

interface Advice {
  headline: string;
  riskLevel: "low" | "moderate" | "high";
  summary: string;
  topHedges: { market: string; action: string; reason: string }[];
  insights: string[];
}

type AdviceState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "off" }
  | { status: "error"; message: string }
  | { status: "done"; advice: Advice };

function usd(n: number) {
  if (!Number.isFinite(n)) n = 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// A real Polymarket wallet with live positions — powers the "Try a demo" button
// so anyone (e.g. a grant reviewer) can see the product work without funds.
const DEMO_ADDRESS = "0xce25e214d5cfe4f459cf67f08df581885aae7fdc";

const SITE_URL = "https://hedgehub.app";

/** Open an X (Twitter) compose intent prefilled with a hedge result. */
function shareWin(text: string) {
  track("share_clicked");
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(SITE_URL)}`;
  window.open(intent, "_blank", "noopener,noreferrer");
}

function ShareButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => shareWin(text)}
      className="shrink-0 rounded-full border border-emerald-600/30 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
    >
      Share on X 𝕏
    </button>
  );
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [advice, setAdvice] = useState<AdviceState>({ status: "hidden" });
  const [tradeId, setTradeId] = useState<TradeIdentity | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [secured, setSecured] = useState<{ count: number; secured: number }>({
    count: 0,
    secured: 0,
  });
  const loadedInputRef = useRef<string>("");

  // Running tally of value secured through the app (localStorage-backed).
  useEffect(() => {
    const refresh = () => setSecured(getSecuredSummary());
    refresh();
    window.addEventListener(TRADE_EVENT, refresh);
    return () => window.removeEventListener(TRADE_EVENT, refresh);
  }, []);
  const { address: connectedAddress } = useAccount();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const isEmbedded =
    wallets.find((w) => w.address?.toLowerCase() === connectedAddress?.toLowerCase())
      ?.walletClientType === "privy";

  // Connecting a wallet auto-loads that wallet's portfolio.
  useEffect(() => {
    if (connectedAddress) {
      setAddress(connectedAddress);
      load(connectedAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress]);

  // Resolve the connected wallet's Polymarket proxy (the maker/funder). Orders
  // must be signed as the proxy, not the bare EOA, or Polymarket rejects them.
  useEffect(() => {
    let cancelled = false;
    if (!connectedAddress) {
      setTradeId(null);
      return;
    }
    fetch(`/api/proxy?address=${connectedAddress}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || j.error) return;
        // Authoritative: where positions actually live (safe → sig 2, proxy → sig 1).
        if (j.fundedKind === "safe") {
          return setTradeId({ funder: j.funded, signatureType: SignatureTypeV2.POLY_GNOSIS_SAFE });
        }
        if (j.fundedKind === "proxy") {
          return setTradeId({ funder: j.funded, signatureType: SignatureTypeV2.POLY_PROXY });
        }
        if (j.fundedKind === "eoa") {
          return setTradeId({ funder: j.funded, signatureType: SignatureTypeV2.EOA });
        }
        // No positions yet — best-effort guess by wallet type.
        setTradeId(
          isEmbedded
            ? { funder: j.proxy, signatureType: SignatureTypeV2.POLY_PROXY }
            : { funder: j.safe, signatureType: SignatureTypeV2.POLY_GNOSIS_SAFE }
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectedAddress, isEmbedded]);

  async function load(addrArg?: string, opts?: { silent?: boolean }) {
    const addr = (addrArg ?? address).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      if (!opts?.silent)
        setState({ status: "error", message: "Enter a valid wallet address (0x… 40 hex chars)." });
      return;
    }
    // A silent refresh updates prices in place without the loading skeleton.
    if (!opts?.silent) {
      setState({ status: "loading" });
      setAdvice({ status: "hidden" });
    }
    try {
      const res = await fetch(`/api/hedge?address=${addr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      loadedInputRef.current = addr;
      setState({
        status: "loaded",
        address: json.address,
        kind: json.kind,
        cash: json.cash ?? 0,
        positions: json.positions,
        suggestions: json.suggestions,
        portfolio: json.portfolio,
      });
      setLastUpdated(Date.now());
      if (!opts?.silent) {
        track("wallet_analyzed", {
          kind: json.kind ?? "none",
          positions: json.positions.length,
        });
        if (json.positions.length > 0) loadAdvice(json.address);
      }
    } catch (err) {
      // On a silent refresh, keep the last good data instead of erroring out.
      if (!opts?.silent)
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Live prices: silently re-fetch the loaded portfolio every 20s so the locked-in
  // P/L stays current. Pauses when the tab is hidden.
  useEffect(() => {
    if (state.status !== "loaded") return;
    const id = setInterval(() => {
      if (loadedInputRef.current && !document.hidden) {
        load(loadedInputRef.current, { silent: true });
      }
    }, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  async function loadAdvice(addr: string) {
    setAdvice({ status: "loading" });
    try {
      const res = await fetch(`/api/advisor?address=${addr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Advisor failed");
      if (!json.enabled) return setAdvice({ status: "off" });
      if (!json.advice) return setAdvice({ status: "hidden" });
      setAdvice({ status: "done", advice: json.advice });
    } catch (err) {
      setAdvice({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const totalValue =
    state.status === "loaded" ? state.positions.reduce((s, p) => s + p.currentValue, 0) : 0;
  const totalPnl =
    state.status === "loaded" ? state.positions.reduce((s, p) => s + p.cashPnl, 0) : 0;

  // "Ripe" hedges: positions where a full hedge now locks in a profit.
  const ripe =
    state.status === "loaded"
      ? state.suggestions.filter((s) => s.worthHedging && !s.alreadyHedged && s.hedgeSize >= 5)
      : [];
  const totalLockable = ripe.reduce((a, s) => a + s.lockedPnl, 0);

  // Optional browser notifications when a NEW position ripens into a green hedge.
  const [notify, setNotify] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  async function enableNotify() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    // Seed with what's already ripe so the user isn't blasted on enable.
    notifiedRef.current = new Set(ripe.map((s) => s.position.asset));
    setNotify(true);
  }

  useEffect(() => {
    if (!notify || state.status !== "loaded") return;
    const ripeNow = state.suggestions.filter(
      (s) => s.worthHedging && !s.alreadyHedged && s.hedgeSize >= 5
    );
    for (const s of ripeNow) {
      if (!notifiedRef.current.has(s.position.asset)) {
        notifiedRef.current.add(s.position.asset);
        try {
          new Notification("Time to hedge 🟢", {
            body: `${s.position.title} — lock in +${usd(s.lockedPnl)} now`,
          });
        } catch {
          /* ignore */
        }
      }
    }
    // Let a position re-alert if it drops out of the money and ripens again later.
    const ids = new Set(ripeNow.map((s) => s.position.asset));
    for (const id of [...notifiedRef.current]) if (!ids.has(id)) notifiedRef.current.delete(id);
  }, [state, notify]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6">
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Risk co-pilot for Polymarket
          </p>
          <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Lock in your Polymarket{" "}
            <span className="text-emerald-600">profits.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-500 dark:text-zinc-400">
            We read your whole book, price the other side of every position live, and
            show you exactly what a hedge locks in — one click, no math, no waiting for
            the market to resolve.
          </p>

          {secured.count > 0 && (
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              You’ve secured{" "}
              <span className="font-medium text-emerald-600">{usd(secured.secured)}</span>{" "}
              across {secured.count} trade{secured.count === 1 ? "" : "s"} here
            </p>
          )}

          {/* Analyzer */}
          <div className="mt-9 flex w-full max-w-lg flex-col gap-2.5 sm:flex-row">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Paste a wallet address  0x…"
              spellCheck={false}
              className="flex-1 rounded-lg border border-black/10 bg-white px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:focus:border-zinc-500"
            />
            <button
              onClick={() => load()}
              disabled={state.status === "loading"}
              className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {state.status === "loading" ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          {state.status === "error" && (
            <p className="mt-3 text-sm font-medium text-red-600">{state.message}</p>
          )}
          <p className="mt-3 text-sm text-zinc-500">
            {!authenticated && (
              <>
                <button
                  onClick={() => {
                    track("hero_signin");
                    login();
                  }}
                  className="font-medium text-emerald-600 underline-offset-2 hover:underline"
                >
                  Sign in with email or wallet
                </button>
                <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
              </>
            )}
            No wallet handy?{" "}
            <button
              onClick={() => {
                track("demo_clicked");
                setAddress(DEMO_ADDRESS);
                load(DEMO_ADDRESS);
              }}
              className="font-medium text-emerald-600 underline-offset-2 hover:underline"
            >
              Try a live demo →
            </button>
          </p>

          {/* How it works + example (only before results) */}
          {state.status !== "loaded" && (
            <div className="mt-16 max-w-2xl border-t border-black/[0.07] pt-10 dark:border-white/[0.07]">
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                {[
                  ["01", "Connect", "We load your Polymarket positions automatically."],
                  ["02", "See the lock-in", "Every position priced against its live opposite — with your guaranteed P/L."],
                  ["03", "Hedge in one click", "Slide how much to hedge and lock it in. No math, no waiting."],
                ].map(([n, t, d]) => (
                  <div key={n}>
                    <p className="font-mono text-xs text-emerald-600">{n}</p>
                    <p className="mt-2 text-sm font-semibold">{t}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{d}</p>
                  </div>
                ))}
              </div>

              <p className="mt-10 max-w-xl text-sm leading-7 text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Why hedge?
                </span>{" "}
                You bought a team at 67¢; it climbed to 88¢. Rather than risk a comeback,
                you buy the other side for 12¢ — locking in{" "}
                <span className="font-medium text-emerald-600">+31%</span> no matter who
                wins. We spot these moments across your whole book for you.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Open a position — buy through our builder code */}
      <OpenPositionPanel tradeId={tradeId} />

      {/* Loading skeleton */}
      {state.status === "loading" && (
        <section className="space-y-3 pb-20">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-black/[0.06] bg-zinc-50 dark:border-white/[0.06] dark:bg-zinc-900"
            />
          ))}
        </section>
      )}

      {/* Results */}
      {state.status === "loaded" && (
        <section className="space-y-6 pb-20">
          {(state.kind === "safe" || state.kind === "proxy") && (
            <p className="text-sm text-zinc-500">
              Showing your Polymarket wallet{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {state.address.slice(0, 6)}…{state.address.slice(-4)}
              </span>{" "}
              (derived from your connected wallet).
            </p>
          )}

          {ripe.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/30">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                🔔 {ripe.length} position{ripe.length === 1 ? "" : "s"} ready to hedge — lock in{" "}
                <span className="font-semibold">+{usd(totalLockable)}</span> total right now.
              </p>
              {notify ? (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Alerts on ✓
                </span>
              ) : (
                <button
                  onClick={enableNotify}
                  className="rounded-full border border-emerald-600/30 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  🔔 Alert me when ripe
                </button>
              )}
            </div>
          )}

          <AdvicePanel advice={advice} />

          <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] border-y border-black/[0.06] dark:divide-white/[0.06] dark:border-white/[0.06] sm:grid-cols-4 sm:divide-y-0">
            <Stat label="Cash · USDC" value={usd(state.cash)} />
            <Stat label="Portfolio value" value={usd(totalValue)} />
            <Stat
              label="Lockable now"
              value={`${totalLockable > 0 ? "+" : ""}${usd(totalLockable)}`}
              accent={totalLockable > 0 ? "emerald" : undefined}
            />
            <Stat
              label="Unrealized P/L"
              value={`${totalPnl >= 0 ? "+" : ""}${usd(totalPnl)}`}
              accent={totalPnl >= 0 ? "emerald" : "red"}
            />
          </div>

          {state.portfolio && state.positions.length > 0 && (
            <PortfolioCard p={state.portfolio} />
          )}

          {state.positions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-base font-medium">No open positions yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
                Nothing to hedge on this wallet. Open a position in the panel above to get
                started, or paste the Polymarket address you trade with into the field at
                the top.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Hedge suggestions</h2>
                  <LiveBadge lastUpdated={lastUpdated} />
                </div>
                <span className="text-sm text-zinc-400">
                  {state.suggestions.length} position
                  {state.suggestions.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm text-zinc-500">
                <span className="font-medium text-emerald-600">Green</span> = hedging now
                locks in a profit. Drag the slider on a card to hedge part of a position
                and keep some upside.
              </p>
              {state.suggestions.map((s) => (
                <HedgeCard key={s.position.asset} s={s} tradeId={tradeId} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface MarketToken {
  outcome: string;
  tokenId: string;
  price: number;
  live: boolean;
}
interface ResolvedMarket {
  question: string;
  slug: string;
  image: string;
  acceptingOrders: boolean;
  isEvent: boolean;
  tokens: MarketToken[];
}

function OpenPositionPanel({ tradeId }: { tradeId: TradeIdentity | null }) {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState<ResolvedMarket | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState("5");
  const [order, setOrder] = useState<OrderState>({ status: "idle" });

  async function loadMarket() {
    if (!query.trim()) return;
    setLoading(true);
    setErr("");
    setMarket(null);
    setOrder({ status: "idle" });
    try {
      const res = await fetch(`/api/market?q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load market");
      setMarket(json);
      setPick(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const token = market?.tokens[pick];
  const usdAmount = Number(amount);
  // Cross the spread a touch so the limit order fills immediately.
  const limitPrice = token ? Math.min(0.99, Math.round((token.price + 0.02) * 100) / 100) : 0;
  const shares =
    token && limitPrice > 0 && usdAmount > 0
      ? Math.round((usdAmount / limitPrice) * 100) / 100
      : 0;
  // Polymarket rejects orders below 5 shares.
  const MIN_SHARES = 5;
  const minCost = limitPrice > 0 ? Math.ceil(MIN_SHARES * limitPrice * 100) / 100 : 0;

  async function buy() {
    if (!token || !isConnected || !walletClient || !address) return;
    setOrder({ status: "placing" });
    const res = await placeOrderFromBrowser({
      walletClient,
      address,
      funder: tradeId?.funder,
      signatureType: tradeId?.signatureType,
      tokenID: token.tokenId,
      price: limitPrice,
      size: shares,
      side: "BUY",
    });
    if (res.ok) {
      setOrder({ status: "done", orderID: res.orderID });
      track("position_opened");
    } else if (res.geoblocked) setOrder({ status: "geoblocked", message: res.message });
    else if (res.unsupported) setOrder({ status: "unsupported", message: res.message });
    else setOrder({ status: "error", message: res.message });
  }

  return (
    <section className="pb-8">
      <div className="rounded-2xl border border-black/[0.07] bg-white p-5 dark:border-white/[0.07] dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Open a position</h2>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            live prices
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Buy into any market right here — then hedge or take profit in the same place,
          at live order-book prices.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadMarket()}
            placeholder="Paste a Polymarket market URL or slug"
            spellCheck={false}
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition-colors focus:border-emerald-500 dark:border-white/10 dark:bg-zinc-950"
          />
          <button
            onClick={loadMarket}
            disabled={loading}
            className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            {loading ? "Loading…" : "Load market"}
          </button>
        </div>
        {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}

        {market && !token && (
          <p className="mt-4 text-sm font-medium text-amber-600">
            This market isn’t accepting orders right now (it may be closed or resolved).
            Try an active market.
          </p>
        )}

        {market && token && (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              {market.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={market.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              )}
              <p className="text-sm font-medium">{market.question}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {market.tokens.map((t, i) => (
                <button
                  key={t.tokenId}
                  onClick={() => setPick(i)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    i === pick
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                  }`}
                >
                  {t.outcome} · {(t.price * 100).toFixed(0)}¢
                </button>
              ))}
            </div>
            {market.isEvent && (
              <p className="-mt-2 text-xs text-zinc-500">
                Multi-outcome event — buying <span className="font-medium">Yes</span> on the
                selected outcome.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Amount (USDC)</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="w-28 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-zinc-950"
                />
              </label>
              <p className="text-sm text-zinc-500">
                ≈ <span className="font-medium text-zinc-700 dark:text-zinc-300">{shares}</span>{" "}
                shares @ {limitPrice.toFixed(2)}
              </p>
            </div>

            {order.status === "done" ? (
              <p className="text-sm font-medium text-emerald-600">
                ✓ Order placed{order.orderID ? ` · ${order.orderID.slice(0, 10)}…` : ""}. Load your
                wallet above to hedge it.
              </p>
            ) : order.status === "geoblocked" ? (
              <p className="text-sm font-medium text-amber-600">
                Your region can’t open positions on Polymarket. Connect from an allowed region.
              </p>
            ) : order.status === "unsupported" ? (
              <p className="text-sm font-medium text-amber-600">{DEPOSIT_WALLET_NOTE}</p>
            ) : order.status === "error" ? (
              <p className="text-sm font-medium text-red-600">{order.message}</p>
            ) : null}

            {isConnected && tradeId && (
              <p className="text-xs text-zinc-400">
                Trading through your Polymarket wallet{" "}
                <span className="font-mono">
                  {tradeId.funder.slice(0, 6)}…{tradeId.funder.slice(-4)}
                </span>
                . Make sure it’s funded (deposit on Polymarket first).
              </p>
            )}
            {(() => {
              const reason = !isConnected
                ? "Connect your wallet to buy."
                : !tradeId
                  ? "Finding your Polymarket wallet… (one moment)"
                  : !market.acceptingOrders
                    ? "This market isn’t accepting orders."
                    : shares <= 0
                      ? "Enter an amount in USDC."
                      : shares < MIN_SHARES
                        ? `Minimum order is ${MIN_SHARES} shares — increase to ~${usd(minCost)}.`
                        : "";
              return (
                <>
                  <button
                    onClick={buy}
                    disabled={order.status === "placing" || reason !== ""}
                    className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {order.status === "placing"
                      ? "Placing…"
                      : `Buy ${token.outcome} · ${usd(usdAmount || 0)}`}
                  </button>
                  {reason && order.status !== "placing" && (
                    <p className="mt-2 text-sm text-zinc-500">{reason}</p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}

/** Pulsing "Live · updated Ns ago" badge — proves prices auto-refresh. */
function LiveBadge({ lastUpdated }: { lastUpdated: number }) {
  const [now, setNow] = useState<number>(() => lastUpdated || 0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!lastUpdated) return null;
  const secs = Math.max(0, Math.round((now - lastUpdated) / 1000));
  const ago = secs < 5 ? "just now" : `${secs}s ago`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · {ago}
    </span>
  );
}

function AdvicePanel({ advice }: { advice: AdviceState }) {
  if (advice.status === "hidden") return null;

  const riskColor =
    advice.status === "done"
      ? advice.advice.riskLevel === "high"
        ? "text-red-600"
        : advice.advice.riskLevel === "moderate"
          ? "text-amber-600"
          : "text-emerald-600"
      : "";

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-50 to-white p-5 dark:border-violet-400/20 dark:from-violet-950/30 dark:to-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white">
          AI
        </span>
        <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
          Claude risk analysis
        </h2>
        {advice.status === "loading" && (
          <span className="ml-auto text-xs text-violet-500">Analyzing…</span>
        )}
      </div>

      {advice.status === "loading" && (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-violet-200/60 dark:bg-violet-800/40" />
          <div className="h-3 w-full animate-pulse rounded bg-violet-200/40 dark:bg-violet-800/30" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-violet-200/40 dark:bg-violet-800/30" />
        </div>
      )}

      {advice.status === "off" && (
        <p className="text-sm text-zinc-500">
          AI analysis is taking a short break — your hedge numbers below are live and
          unaffected.
        </p>
      )}

      {advice.status === "error" && (
        <p className="text-sm text-red-600">AI advisor error — {advice.message}</p>
      )}

      {advice.status === "done" && (
        <div className="space-y-4">
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {advice.advice.headline}
            </p>
            <p className={`text-xs font-medium uppercase tracking-wide ${riskColor}`}>
              {advice.advice.riskLevel} risk
            </p>
          </div>

          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {advice.advice.summary}
          </p>

          {advice.advice.topHedges.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Hedges that matter most
              </p>
              {advice.advice.topHedges.map((h, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-black/5 bg-white/70 p-3 dark:border-white/5 dark:bg-zinc-950/40"
                >
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {h.market}
                  </p>
                  <p className="mt-0.5 text-sm text-violet-700 dark:text-violet-300">
                    {h.action}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">{h.reason}</p>
                </div>
              ))}
            </div>
          )}

          {advice.advice.insights.length > 0 && (
            <ul className="space-y-1.5">
              {advice.advice.insights.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="text-violet-500">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PortfolioCard({ p }: { p: PortfolioInsight }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 dark:border-white/[0.07] dark:bg-zinc-900">
      <h2 className="text-base font-semibold">Portfolio insights</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Spread across</p>
          <p className="mt-0.5 font-medium">
            {p.eventCount} event{p.eventCount === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Already hedged</p>
          <p className="mt-0.5 font-medium">
            {p.alreadyHedgedCount} market{p.alreadyHedgedCount === 1 ? "" : "s"}
          </p>
        </div>
        {p.topEvent && (
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Biggest concentration
            </p>
            <p className="mt-0.5 truncate font-medium" title={p.topEvent.title}>
              {Math.round(p.topEvent.share * 100)}% · {p.topEvent.title}
            </p>
          </div>
        )}
      </div>
      {p.topEvent && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          If <span className="font-medium">{p.topEvent.title}</span> resolves against you,
          you’d lose{" "}
          <span className="font-semibold text-amber-600">{usd(p.topEvent.value)}</span>
          {p.topEvent.share > 0.5 ? " — over half your book. Worth hedging." : "."}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const color =
    accent === "amber"
      ? "text-amber-600"
      : accent === "red"
        ? "text-red-600"
        : accent === "emerald"
          ? "text-emerald-600"
          : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="px-5 py-5">
      <p className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight ${color}`}>
        {value}
      </p>
    </div>
  );
}

type OrderState =
  | { status: "idle" }
  | { status: "placing" }
  | { status: "done"; orderID: string }
  | { status: "error"; message: string }
  | { status: "unsupported"; message: string }
  | { status: "geoblocked"; message: string };

const DEPOSIT_WALLET_NOTE =
  "Your Polymarket account uses the new smart wallet, which can’t trade in-app yet (a fix is pending in Polymarket’s V2 SDK). You can still analyze hedges here and place this trade on polymarket.com.";

function HedgeCard({ s, tradeId }: { s: HedgeSuggestion; tradeId: TradeIdentity | null }) {
  const p = s.position;
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [order, setOrder] = useState<OrderState>({ status: "idle" });
  const [pct, setPct] = useState(100);

  // Partial hedge: hedge `pct`% of the position. Back out the cost basis from the
  // full-hedge locked P/L, then model both resolution outcomes for this fraction.
  const S = s.hedgeSize;
  const h = s.hedgePrice;
  const fraction = pct / 100;
  const initialValue = S * (1 - h) - s.lockedPnl;
  const hedgedShares = Math.round(S * fraction * 100) / 100;
  const hedgeCost = Math.round(hedgedShares * h * 100) / 100;
  const totalCost = initialValue + hedgeCost;
  // If your side wins you keep all S shares; if the opposite wins, only the hedge pays.
  const ifYouWin = Math.round((S - totalCost) * 100) / 100;
  const ifOppWin = Math.round((hedgedShares - totalCost) * 100) / 100;
  const worstPnl = Math.min(ifYouWin, ifOppWin);
  const tooSmall = hedgedShares < 5;

  async function hedge() {
    if (!isConnected || !walletClient || !address || tooSmall) return;
    setOrder({ status: "placing" });
    const res = await placeHedgeFromBrowser({
      walletClient,
      address,
      funder: tradeId?.funder,
      signatureType: tradeId?.signatureType,
      tokenID: s.hedgeTokenId,
      price: s.hedgePrice,
      size: hedgedShares,
    });
    if (res.ok) {
      setOrder({ status: "done", orderID: res.orderID });
      recordTrade({ kind: "hedge", market: p.title, locked: worstPnl }, Date.now());
      track("hedge_placed", { pct });
    } else if (res.geoblocked) setOrder({ status: "geoblocked", message: res.message });
    else if (res.unsupported) setOrder({ status: "unsupported", message: res.message });
    else setOrder({ status: "error", message: res.message });
  }

  // Take-profit: sell the whole position at the live bid to realize P/L now.
  const [sellOrder, setSellOrder] = useState<OrderState>({ status: "idle" });
  const sellPrice = Math.max(0.01, Math.round((p.curPrice - 0.02) * 100) / 100);
  const sellProceeds = Math.round(p.size * sellPrice * 100) / 100;
  const sellRealized = Math.round((sellProceeds - initialValue) * 100) / 100;
  const sellTooSmall = p.size < 5;

  async function sell() {
    if (!isConnected || !walletClient || !address || sellTooSmall) return;
    setSellOrder({ status: "placing" });
    const res = await placeOrderFromBrowser({
      walletClient,
      address,
      funder: tradeId?.funder,
      signatureType: tradeId?.signatureType,
      tokenID: p.asset,
      price: sellPrice,
      size: p.size,
      side: "SELL",
    });
    if (res.ok) {
      setSellOrder({ status: "done", orderID: res.orderID });
      recordTrade({ kind: "sell", market: p.title, locked: sellRealized }, Date.now());
      track("take_profit");
    } else if (res.geoblocked) setSellOrder({ status: "geoblocked", message: res.message });
    else if (res.unsupported) setSellOrder({ status: "unsupported", message: res.message });
    else setSellOrder({ status: "error", message: res.message });
  }

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 transition-colors hover:border-black/15 dark:border-white/[0.07] dark:bg-zinc-900 dark:hover:border-white/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {p.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.icon}
              alt=""
              className="mt-0.5 h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="mt-0.5 h-10 w-10 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium leading-snug">{p.title}</p>
            <p className="mt-1 text-sm text-zinc-500">
              You hold{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {Math.round(p.size)} {p.outcome}
              </span>{" "}
              · risk{" "}
              <span className="font-medium text-amber-600">{usd(s.downsideRisk)}</span>
              {s.alreadyHedged && (
                <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  already hedged
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={hedge}
          disabled={
            !isConnected ||
            order.status === "placing" ||
            order.status === "done" ||
            tooSmall
          }
          title={isConnected ? "Place this hedge" : "Connect your wallet first"}
          className="shrink-0 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-600/40"
        >
          {order.status === "placing"
            ? "Placing…"
            : order.status === "done"
              ? "Hedged ✓"
              : !isConnected
                ? "Connect to hedge"
                : tooSmall
                  ? "Too small"
                  : pct === 100
                    ? "Hedge"
                    : `Hedge ${pct}%`}
        </button>
      </div>

      {order.status === "idle" && !s.alreadyHedged && (
        <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/5">
          {/* How much of the position to hedge */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Hedge amount</span>
            <span className="font-semibold">
              {pct}% · buy {hedgedShares} {s.hedgeOutcome} @ {(s.hedgePrice * 100).toFixed(0)}¢
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="mt-2 w-full accent-emerald-600"
            aria-label="Hedge amount"
          />
          <div className="mt-0.5 flex justify-between text-xs text-zinc-400">
            <span>Less cover · more upside</span>
            <span>Fully locked</span>
          </div>

          {/* What you end up with under each outcome */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Scenario label={`If ${p.outcome} wins`} pnl={ifYouWin} />
            <Scenario label={`If ${s.hedgeOutcome} wins`} pnl={ifOppWin} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Hedge cost {usd(hedgeCost)} ·{" "}
            {pct === 100
              ? "same result whoever wins (fully locked)"
              : `worst case ${usd(worstPnl)}`}
          </p>

          {tooSmall ? (
            <p className="mt-3 text-sm text-amber-600">
              {S < 5
                ? "Position too small to hedge — Polymarket’s minimum order is 5 shares."
                : "Below the 5-share minimum — drag the hedge amount up."}
            </p>
          ) : (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                s.worthHedging
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400"
              }`}
            >
              {s.worthHedging
                ? `✓ Good time to hedge — a full hedge locks in +${usd(s.lockedPnl)} (+${(
                    s.lockedPnlPct * 100
                  ).toFixed(1)}%), whoever wins.`
                : `Not ripe yet — a full hedge would lock in ${usd(s.lockedPnl)} (${(
                    s.lockedPnlPct * 100
                  ).toFixed(1)}%). Hold, or hedge to cap risk.`}
            </div>
          )}
        </div>
      )}

      {order.status === "idle" && s.alreadyHedged && (
        <p className="mt-4 border-t border-black/5 pt-4 text-sm text-emerald-600 dark:border-white/5">
          ✓ This market is already hedged — you hold both sides.
        </p>
      )}

      {order.status === "done" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-emerald-600">
            ✓ Hedge placed — locked in {worstPnl >= 0 ? "+" : ""}
            {usd(worstPnl)}{order.orderID ? ` (${order.orderID.slice(0, 8)}…)` : ""}.
          </p>
          <ShareButton
            text={`Just locked in ${worstPnl >= 0 ? "+" : ""}${usd(
              worstPnl
            )} on a Polymarket position with HedgeHub 🔒`}
          />
        </div>
      )}
      {order.status === "geoblocked" && (
        <p className="mt-3 text-sm font-medium text-amber-600">
          Trading isn’t available in your region — Polymarket restricts this by location.
        </p>
      )}
      {order.status === "unsupported" && (
        <p className="mt-3 text-sm font-medium text-amber-600">{DEPOSIT_WALLET_NOTE}</p>
      )}
      {order.status === "error" && (
        <p className="mt-3 text-sm font-medium text-red-600">Order failed — {order.message}</p>
      )}

      {/* Take profit: exit the position entirely instead of hedging it. */}
      {order.status === "idle" && !sellTooSmall && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3 text-sm dark:border-white/5">
          <span className="text-zinc-500">
            Or exit now — sell {Math.round(p.size)} {p.outcome} for ~{usd(sellProceeds)} (
            <span className={sellRealized >= 0 ? "text-emerald-600" : "text-red-600"}>
              {sellRealized >= 0 ? "+" : ""}
              {usd(sellRealized)}
            </span>
            )
          </span>
          <button
            onClick={sell}
            disabled={
              !isConnected || sellOrder.status === "placing" || sellOrder.status === "done"
            }
            className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
          >
            {sellOrder.status === "placing"
              ? "Selling…"
              : sellOrder.status === "done"
                ? "Sold ✓"
                : "Take profit"}
          </button>
        </div>
      )}
      {sellOrder.status === "done" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-emerald-600">
            ✓ Sold — realized {sellRealized >= 0 ? "+" : ""}
            {usd(sellRealized)}{sellOrder.orderID ? ` (${sellOrder.orderID.slice(0, 8)}…)` : ""}.
          </p>
          <ShareButton
            text={`Just took profit on a Polymarket position with HedgeHub — ${
              sellRealized >= 0 ? "+" : ""
            }${usd(sellRealized)} realized 🔒`}
          />
        </div>
      )}
      {sellOrder.status === "geoblocked" && (
        <p className="mt-2 text-sm font-medium text-amber-600">
          Trading isn’t available in your region — Polymarket restricts this by location.
        </p>
      )}
      {sellOrder.status === "unsupported" && (
        <p className="mt-2 text-sm font-medium text-amber-600">{DEPOSIT_WALLET_NOTE}</p>
      )}
      {sellOrder.status === "error" && (
        <p className="mt-2 text-sm font-medium text-red-600">Sell failed — {sellOrder.message}</p>
      )}
    </div>
  );
}

/** One resolution outcome of a (partial) hedge: what your P/L would be. */
function Scenario({ label, pnl }: { label: string; pnl: number }) {
  const pos = pnl >= 0;
  return (
    <div
      className={`rounded-xl border p-3 ${
        pos
          ? "border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/20"
          : "border-red-500/20 bg-red-50/60 dark:bg-red-950/20"
      }`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 font-mono text-lg font-semibold ${
          pos ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {pos ? "+" : ""}
        {usd(pnl)}
      </p>
    </div>
  );
}
