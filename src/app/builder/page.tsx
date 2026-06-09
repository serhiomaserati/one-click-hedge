import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Builder — HedgeHub",
  description:
    "How HedgeHub attributes volume to its Polymarket builder code on CLOB V2.",
};

const BUILDER_CODE =
  process.env.NEXT_PUBLIC_BUILDER_CODE ??
  "0x8be51911f257f57dd726ae2dab5cf8aa02c82318ebf537d3ce9783f8a74cc9ea";

export default function BuilderPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Builders Program
      </p>
      <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight">
        Built on Polymarket CLOB V2
      </h1>
      <p className="mt-5 text-lg leading-8 text-zinc-500 dark:text-zinc-400">
        Every order placed through HedgeHub — a buy, a hedge, or a
        take-profit — is attributed on-chain to our builder code. Attribution is{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">native to V2</span>:
        the code is written directly into the order’s <code>builder</code> field, no
        custody and no smart contract.
      </p>

      <div className="mt-8 rounded-xl border border-black/[0.07] p-5 dark:border-white/[0.07]">
        <p className="text-xs uppercase tracking-wider text-zinc-400">Our builder code</p>
        <p className="mt-1.5 break-all font-mono text-sm text-emerald-600">{BUILDER_CODE}</p>
      </div>

      <div className="mt-10 space-y-6 text-sm leading-7 text-zinc-600 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Proven live</p>
          <p className="mt-1">
            Real buy and take-profit orders have filled on production, and the trades
            return attributed to this code via the CLOB <code>getBuilderTrades</code>
            method. Every hedge a user locks in drives real volume to Polymarket.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">How fees work</p>
          <p className="mt-1">
            The builder taker fee is set in our Polymarket Builder Profile and routes to
            us automatically on attributed volume — no extra cost to the user beyond the
            standard taker fee.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Non-custodial</p>
          <p className="mt-1">
            Orders are signed by the user’s own wallet in their browser. We never hold
            keys or funds — we’re a decision layer on top of Polymarket, not a custodian.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <a href="/" className="font-medium text-emerald-600 hover:underline">
          ← Back to the app
        </a>
        <a
          href="https://builders.polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-500 hover:underline"
        >
          Polymarket Builders Program ↗
        </a>
      </div>
    </div>
  );
}
