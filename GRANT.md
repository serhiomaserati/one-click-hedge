# One-Click Hedge — Polymarket Builders Program submission

**An AI risk co-pilot for Polymarket.** Connect → it reads your whole book, prices
the other side of every position live, and lets you **hedge or take profit in one
click** — with a Claude risk read on top.

- **Live:** https://one-click-hedge.vercel.app
- **Try it instantly:** the landing page has a **"Try it with a live demo wallet"**
  button — no funds or connection needed to see it work.
- **Builder attribution:** https://one-click-hedge.vercel.app/builder

---

## The problem

Polymarket gives traders the order types — limit orders, buying the opposite side —
but not the *decision*. Across a dozen positions, figuring out which bets are ripe to
lock in, and exactly how much you'd secure, is tedious manual math. So most traders
never do it and miss the moment to take a guaranteed profit or cap a loss.

## The product

One-Click Hedge is the decision layer on top of Polymarket. It watches your book and
tells you **what, when, and how much** to hedge — with the math already done.

- **Reads your book** — Privy email/wallet login; we auto-resolve your Polymarket
  proxy and load every open position + USDC cash.
- **Prices the hedge live** — for each position we price the opposite outcome from the
  live CLOB order book.
- **Shows the lock-in** — guaranteed P/L in **$ and %**, a partial-hedge **slider**
  (25–100%, keep some upside) with the outcome under each scenario, and a *"good time to
  hedge"* verdict (green = locks in profit now).
- **One click to act** — Hedge (buy the opposite) or Take profit (sell out), signed by
  the user's own wallet.
- **Alerts** — banner + opt-in browser notifications when a position ripens; prices
  auto-refresh every 20s.
- **AI risk read** — Claude (Opus 4.8) reads the whole portfolio and flags the hedges
  that matter most, in plain language.

## Why it's innovative

- **It's a co-pilot, not a button.** The hard part isn't placing the order — it's
  knowing *which* position to lock in and *when*. We continuously compute the locked-in
  P/L across the whole book, surface only the profitable ones, and alert on the moment.
  That discovery + the AI risk read is the part you can't get on Polymarket itself.
- **Native CLOB V2, non-custodial.** Orders are signed client-side by the user's own
  wallet (so geoblock applies per-user, no key custody). Builder attribution is native
  to V2 — the public `builderCode` is written into each order's `builder` field. No
  smart contract, no server-side trading key.
- **Retail-first.** A separate player (HedgePilot) does prediction-market hedging for
  hedge funds (Bloomberg, 13F imports, basket optimization). We're the opposite end:
  dead-simple, one-click, for everyday Polymarket traders — the underserved majority.

## Traction & attribution

- **Proven live on production:** real buy and take-profit orders have filled, and the
  trades return attributed to our builder code via the CLOB `getBuilderTrades` method.
- Every hedge or take-profit a user makes is a real order routed to Polymarket — the
  product's core loop *is* volume generation.
- Built-in growth loop: a **Share on X** button on every filled order ("Just locked in
  +$X with One-Click Hedge"), now with a proper Open Graph card.

## Monetization

Volume-based builder fees (taker fee set in our Builder Profile) on every attributed
order — no extra cost to the user beyond the standard taker fee. The product is
designed so its core action (hedging) is also its revenue and its traction.

## What's built (all live)

Connect → resolve proxy → portfolio (cash / value / lockable / P/L) → per-position
hedge (partial slider + per-outcome scenarios + verdict) **or** take-profit → ripe
alerts → live 20s refresh → "Open a position" buy panel → Claude AI advisor → secured
tracker → Share on X. Built on Next.js 16 + TypeScript + Tailwind + wagmi/viem + Privy
+ `@polymarket/clob-client-v2` + Anthropic SDK.

## Roadmap

1. True cross-event correlated hedging (hedge across different markets, not just the
   same market's opposite side).
2. Support for the new Polymarket "deposit wallet" (POLY_1271 / smart-contract) accounts
   once the upstream V2 SDK's L1-auth wrapping bug is fixed (tracked: clob-client-v2 #65).
3. A public builder-volume dashboard for transparent traction.

---

## 60–90s demo script

1. **(0:00) Land.** Open the site. Read the headline: *"Lock in your Polymarket
   profits — AI risk co-pilot."* Click **"Try it with a live demo wallet."**
2. **(0:10) The book loads.** Point at the stat row: Cash, Portfolio value, **Lockable
   now (+$…)**, Unrealized P/L. Note the **🔔 N positions ready to hedge** alert and the
   AI risk panel summarizing the whole portfolio.
3. **(0:30) A hedge card.** Pick a green one. Show the two outcome scenarios ("if this
   wins / if that wins"), drag the **partial-hedge slider** (50% → keep some upside;
   100% → fully locked), and read the *"✓ Good time to hedge — lock in +$X"* verdict.
4. **(0:50) Act.** (With a real connected wallet) click **Hedge** → wallet signs → *"✓
   Hedge placed — locked in +$X."* Then **Share on X**.
5. **(1:05) Take profit.** On another position click **Take profit** → it sells out and
   shows realized P/L.
6. **(1:15) Attribution.** Open **/builder** — show the on-chain builder code and the
   "proven live" attribution. Close on: *"Polymarket gives you the order types. We tell
   you what to do with them — in one click."*
