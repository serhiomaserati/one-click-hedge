# One-Click Hedge

**An AI risk co-pilot for Polymarket.** Connect your wallet and One-Click Hedge
reads your whole book, prices the other side of every position live, and shows
you exactly what a hedge locks in — then lets you **hedge or take profit in one
click**. Built natively on **CLOB V2** for the [Polymarket Builders Program](https://builders.polymarket.com).

🔗 **Live:** https://one-click-hedge.vercel.app

---

## Why it exists

Polymarket gives you the order types. It doesn't tell you *what to do with them*.
Across a dozen positions, knowing which bets are ripe to lock in — and how much
you'd secure — is tedious manual math, so most traders never do it and miss the
moment.

One-Click Hedge is the decision layer on top: it watches your book and tells you
**what, when, and how much** to hedge, with the math already done.

## What it does

- **Reads your book** — connect (email or wallet via Privy); we auto-resolve your
  Polymarket proxy and load every open position + your USDC cash.
- **Prices the hedge live** — for each position we price the opposite outcome from
  the live order book; holding both sides pays out at resolution, neutralizing
  directional risk.
- **Shows the lock-in** — per position: the guaranteed P/L in **$ and %**, a
  partial-hedge **slider** (hedge 25–100%, keep some upside) with the outcome under
  each scenario, and a *"good time to hedge"* verdict (green = locks in a profit now).
- **One click to act** — **Hedge** (buy the opposite) or **Take profit** (sell out),
  signed by your own wallet, attributed to our builder code on-chain.
- **Alerts** — a banner + opt-in browser notifications when a position ripens into a
  profitable hedge. Prices auto-refresh every 20s.
- **AI risk read** — Claude (Opus 4.8) reads the whole portfolio and explains the
  risk in plain language, flagging the hedges that matter most.

## How it works

```
Connect ─▶ resolve Polymarket proxy ─▶ load open positions + cash
                                              │
                  ┌───────────────────────────┼───────────────────────────┐
                  ▼                           ▼                           ▼
        price opposite side          Claude reads the book        partial-hedge slider
        (live order book)            (plain-language risk)        + per-outcome P/L
                  │
                  ▼
        Hedge / Take profit  ──▶  user's wallet signs (client-side)  ──▶  CLOB V2
                                   builder code attached on-chain (your fees)
```

## Built on CLOB V2 (native, non-custodial)

- **Orders are signed client-side** by the user's own wallet, so Polymarket's
  geoblock applies per-user and we never custody keys.
- **Builder attribution is native to V2** — the public `builderCode` (bytes32) is
  written directly into each order's `builder` field. No HMAC header dance, no
  smart contract.
- **Collateral is pUSD** (V2's USDC-backed token); cash balance is read on-chain.

**Verified live:** real buy + take-profit orders filled on production, and the
trades show up attributed to our builder code via `getBuilderTrades`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · wagmi/viem · Privy
(email + wallet auth) · `@polymarket/clob-client-v2` ·
`@polymarket/builder-relayer-client` (proxy derivation) · Anthropic SDK (Claude).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

### Environment

Secrets live in `.env.local` (gitignored). The only thing the **browser** needs
is the public builder code (`NEXT_PUBLIC_BUILDER_CODE`); the Anthropic key and
all server config stay server-side.

- `NEXT_PUBLIC_BUILDER_CODE` — public bytes32 attribution id (also hardcoded as a fallback)
- `ANTHROPIC_API_KEY` — enables the Claude risk advisor (server-side; panel hides without it)
- `NEXT_PUBLIC_PRIVY_APP_ID` — Privy app id for email/wallet login

Orders are placed by the user's own wallet in the browser — there is **no**
server-side trading key in production.
