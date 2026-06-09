"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { SignatureType } from "@polymarket/clob-client";
import { placeHedgeFromBrowser, placeOrderFromBrowser } from "@/lib/polymarket/client-order";

/** The Polymarket proxy that holds funds + how to sign for it. */
interface TradeIdentity {
  funder: string;
  signatureType: SignatureType;
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
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [advice, setAdvice] = useState<AdviceState>({ status: "hidden" });
  const [tradeId, setTradeId] = useState<TradeIdentity | null>(null);
  const { address: connectedAddress } = useAccount();
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
        setTradeId(
          isEmbedded
            ? { funder: j.proxy, signatureType: SignatureType.POLY_PROXY }
            : { funder: j.safe, signatureType: SignatureType.POLY_GNOSIS_SAFE }
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectedAddress, isEmbedded]);

  async function load(addrArg?: string) {
    const addr = (addrArg ?? address).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setState({ status: "error", message: "Enter a valid wallet address (0x… 40 hex chars)." });
      return;
    }
    setState({ status: "loading" });
    setAdvice({ status: "hidden" });
    try {
      const res = await fetch(`/api/hedge?address=${addr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setState({
        status: "loaded",
        address: json.address,
        kind: json.kind,
        positions: json.positions,
        suggestions: json.suggestions,
        portfolio: json.portfolio,
      });
      if (json.positions.length > 0) loadAdvice(json.address);
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

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

  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Polymarket Builders Program
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Hedge any Polymarket position in{" "}
            <span className="text-emerald-600">one click</span>
          </h1>
          <p className="mt-5 text-balance text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            We read your open positions, find the opposing side of each market at the
            live price, and let you lock in your risk instantly.
          </p>

          {/* Analyzer */}
          <div className="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Paste a wallet address  0x…"
              spellCheck={false}
              className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-3 font-mono text-sm shadow-sm outline-none transition-colors focus:border-emerald-500 dark:border-white/10 dark:bg-zinc-900"
            />
            <button
              onClick={() => load()}
              disabled={state.status === "loading"}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {state.status === "loading" ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          {state.status === "error" && (
            <p className="mt-3 text-sm font-medium text-red-600">{state.message}</p>
          )}

          {/* Feature row (only before results) */}
          {state.status !== "loaded" && (
            <div className="mt-12 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["1 · Read", "Pull every open position from your portfolio."],
                ["2 · Match", "Find the opposite outcome at the live order-book price."],
                ["3 · Hedge", "Lock in your risk with a single click."],
              ].map(([t, d]) => (
                <div
                  key={t}
                  className="rounded-xl border border-black/5 bg-white p-4 text-left dark:border-white/10 dark:bg-zinc-900"
                >
                  <p className="text-sm font-semibold text-emerald-600">{t}</p>
                  <p className="mt-1 text-sm text-zinc-500">{d}</p>
                </div>
              ))}
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
              className="h-28 animate-pulse rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-zinc-900"
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

          <AdvicePanel advice={advice} />

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Portfolio value" value={usd(totalValue)} />
            <Stat label="Downside risk" value={usd(totalValue)} accent="amber" />
            <Stat
              label="Unrealized PnL"
              value={`${totalPnl >= 0 ? "+" : ""}${usd(totalPnl)}`}
              accent={totalPnl >= 0 ? "emerald" : "red"}
            />
          </div>

          {state.portfolio && state.positions.length > 0 && (
            <PortfolioCard p={state.portfolio} />
          )}

          {state.positions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white py-16 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-base font-medium">No open positions</p>
              <p className="mt-1 text-sm text-zinc-500">
                Nothing to hedge for this wallet. If you trade on Polymarket, paste your
                Polymarket profile address above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Hedge suggestions</h2>
                <span className="text-sm text-zinc-400">
                  {state.suggestions.length} position
                  {state.suggestions.length === 1 ? "" : "s"}
                </span>
              </div>
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
  const [amount, setAmount] = useState("2");
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
    if (res.ok) setOrder({ status: "done", orderID: res.orderID });
    else if (res.geoblocked) setOrder({ status: "geoblocked", message: res.message });
    else setOrder({ status: "error", message: res.message });
  }

  return (
    <section className="pb-8">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Open a position</h2>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            via your builder code
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Buy any market through One-Click Hedge — then hedge it below. Every order
          routes through your builder code.
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
            {!isConnected ? (
              <p className="text-sm text-zinc-500">Connect your wallet to buy.</p>
            ) : (
              <button
                onClick={buy}
                disabled={
                  order.status === "placing" ||
                  !market.acceptingOrders ||
                  shares <= 0 ||
                  !tradeId
                }
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {order.status === "placing"
                  ? "Placing…"
                  : `Buy ${token.outcome} · ${usd(usdAmount || 0)}`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
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
          Add an <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to{" "}
          <code className="font-mono text-xs">.env.local</code> to turn on the AI advisor.
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
    <div className="rounded-2xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
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
      {p.topEvent && p.topEvent.share > 0.5 && (
        <p className="mt-3 text-sm text-amber-600">
          ⚠ Over half your value sits in one event — concentrated risk worth hedging.
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
          : "";
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

type OrderState =
  | { status: "idle" }
  | { status: "placing" }
  | { status: "done"; orderID: string }
  | { status: "error"; message: string }
  | { status: "geoblocked"; message: string };

function HedgeCard({ s, tradeId }: { s: HedgeSuggestion; tradeId: TradeIdentity | null }) {
  const p = s.position;
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [order, setOrder] = useState<OrderState>({ status: "idle" });

  async function hedge() {
    if (!isConnected || !walletClient || !address) return;
    setOrder({ status: "placing" });
    const res = await placeHedgeFromBrowser({
      walletClient,
      address,
      funder: tradeId?.funder,
      signatureType: tradeId?.signatureType,
      tokenID: s.hedgeTokenId,
      price: s.hedgePrice,
      size: s.hedgeSize,
    });
    if (res.ok) setOrder({ status: "done", orderID: res.orderID });
    else if (res.geoblocked) setOrder({ status: "geoblocked", message: res.message });
    else setOrder({ status: "error", message: res.message });
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900">
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
          disabled={!isConnected || order.status === "placing" || order.status === "done"}
          title={isConnected ? "Place this hedge" : "Connect your wallet first"}
          className="shrink-0 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-600/40"
        >
          {order.status === "placing"
            ? "Placing…"
            : order.status === "done"
              ? "Hedged ✓"
              : !isConnected
                ? "Connect to hedge"
                : "Hedge"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-black/5 pt-4 text-sm dark:border-white/5 sm:grid-cols-4">
        <Field label="Buy" value={`${Math.round(s.hedgeSize)} ${s.hedgeOutcome}`} />
        <Field
          label={s.livePrice ? "Price · live" : "Price · est."}
          value={`${(s.hedgePrice * 100).toFixed(1)}¢`}
        />
        <Field label="Hedge cost" value={usd(s.hedgeCost)} />
        <Field
          label="Locks in"
          value={`${s.lockedPnl >= 0 ? "+" : ""}${usd(s.lockedPnl)}`}
          accent={s.lockedPnl >= 0 ? "emerald" : "red"}
        />
      </div>

      {order.status === "done" && (
        <p className="mt-3 text-sm font-medium text-emerald-600">
          ✓ Hedge order placed{order.orderID ? ` (${order.orderID.slice(0, 10)}…)` : ""}.
        </p>
      )}
      {order.status === "geoblocked" && (
        <p className="mt-3 text-sm font-medium text-amber-600">
          Trading isn’t available in your region — Polymarket restricts this by location.
        </p>
      )}
      {order.status === "error" && (
        <p className="mt-3 text-sm font-medium text-red-600">Order failed — {order.message}</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "red"
        ? "text-red-600"
        : "text-zinc-700 dark:text-zinc-300";
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-0.5 font-mono ${color}`}>{value}</p>
    </div>
  );
}
