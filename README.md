# One-Click Hedge

Hedge any Polymarket position in one click. Built for the **Polymarket Builders Program** on **CLOB V2**.

One-Click Hedge reads a trader's open Polymarket positions, finds the opposing
side of every market at the live order-book price, and lets them lock in their
risk with a single click — with an AI risk read from Claude on top.

## How it works

```
Wallet address ──▶ Data API ──▶ open positions
                                     │
                                     ▼
            For each position, price the opposite outcome
            from the live CLOB order book (the hedge leg)
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
           Risk + locked-in   Claude AI risk    One-click Hedge
            P/L per position     analysis        (browser-signed)
```

- **Read** — open positions come from the public Polymarket Data API (no auth).
- **Match** — for each position we price `size` shares of the opposite outcome
  from the live order book; holding both sides pays `size` dollars at
  resolution, neutralizing directional risk.
- **Analyze** — Claude (Opus) explains the portfolio's risk in plain language and
  ranks the hedges that remove the most risk per dollar.
- **Hedge** — the user's own wallet signs and submits the order **client-side**
  (so Polymarket's geoblock applies per-user). Builder-fee attribution is signed
  **server-side** so the builder secret never reaches the browser.

## Architecture

| Piece | Where | Why |
|---|---|---|
| Portfolio + hedge math | server (`/api/hedge`) | public data, fast |
| AI risk advisor | server (`/api/advisor`) | keeps the Anthropic key server-side |
| Order signing + submit | **browser** (user's wallet) | per-user geoblock, no key custody |
| Builder-fee headers | server (`/api/builder/sign`) | keeps the builder secret off the client |

Non-custodial: we never hold user keys. Built natively on CLOB **V2** (the
`bytes32 builder` attribution model), no smart contract required.

## Stack

Next.js (App Router) · TypeScript · Tailwind · wagmi/viem ·
`@polymarket/clob-client` · `@polymarket/builder-signing-sdk` · Anthropic SDK.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Environment

See `.env.example`. Secrets live in `.env.local` (gitignored):

- `BUILDER_CODE`, `BUILDER_API_ADDRESS` — public builder identifiers
- `BUILDER_API_KEY` / `SECRET` / `PASSPHRASE` — builder fee attribution (server only)
- `ANTHROPIC_API_KEY` — enables the AI advisor (optional; panel hides without it)
- `BUILDER_FEE_BPS` — builder fee in basis points (default 15 = 0.15%)

`scripts/` holds dev-only helpers (`check-wallet`, `verify-auth`, `approve`,
`test-order`) for validating the trading pipeline.
