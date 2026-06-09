/**
 * AI risk advisor (Stage AI) — SERVER-SIDE ONLY.
 *
 * Sends the user's positions + computed hedges to Claude and gets back a plain-
 * language risk read plus a ranking of which hedges matter most. Degrades
 * gracefully: if ANTHROPIC_API_KEY is unset, returns null and the UI hides the
 * panel — nothing else breaks.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Position } from "../polymarket/positions";
import type { HedgeSuggestion } from "../polymarket/hedge";

/** Claude model — most capable. Switch to claude-sonnet-4-6 / claude-haiku-4-5 to cut cost. */
const MODEL = "claude-opus-4-8";

export interface PortfolioAdvice {
  headline: string;
  riskLevel: "low" | "moderate" | "high";
  summary: string;
  topHedges: { market: string; action: string; reason: string }[];
  insights: string[];
}

/** JSON Schema the model is forced to fill (structured outputs). */
const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    riskLevel: { type: "string", enum: ["low", "moderate", "high"] },
    summary: { type: "string" },
    topHedges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          market: { type: "string" },
          action: { type: "string" },
          reason: { type: "string" },
        },
        required: ["market", "action", "reason"],
      },
    },
    insights: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "riskLevel", "summary", "topHedges", "insights"],
} as const;

export function isAdvisorEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function getPortfolioAdvice(
  positions: Position[],
  suggestions: HedgeSuggestion[]
): Promise<PortfolioAdvice | null> {
  if (!isAdvisorEnabled() || suggestions.length === 0) return null;

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // Trim the payload to what the model needs to reason about.
  const compact = suggestions.slice(0, 25).map((s) => ({
    market: s.position.title,
    youHold: `${Math.round(s.position.size)} ${s.position.outcome}`,
    valueUsd: Math.round(s.position.currentValue * 100) / 100,
    pnlUsd: Math.round(s.position.cashPnl * 100) / 100,
    hedge: `buy ${Math.round(s.hedgeSize)} ${s.hedgeOutcome} @ ${(s.hedgePrice * 100).toFixed(0)}c`,
    hedgeCostUsd: Math.round(s.hedgeCost * 100) / 100,
    locksInUsd: Math.round(s.lockedPnl * 100) / 100,
    locksInPct: Math.round(s.lockedPnlPct * 1000) / 10,
    worthHedgingNow: s.worthHedging,
  }));
  const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: ADVICE_SCHEMA },
    },
    system:
      "You are a sharp, plain-spoken risk advisor inside a Polymarket hedging app. " +
      "You get a user's open prediction-market positions and a computed one-click hedge for each " +
      "(buying the opposite outcome to lock in value). Explain the portfolio's risk simply, then rank the " +
      "hedges that matter most by how much risk they remove per dollar. Be concrete and honest: if a hedge " +
      "would lock in a loss, say so. Do not add financial-advice disclaimers or 'consult a professional' filler. " +
      "Keep every field tight and useful; reference real market titles from the data.",
    messages: [
      {
        role: "user",
        content:
          `Portfolio total value: $${totalValue.toFixed(2)}.\n` +
          `Positions and their one-click hedges (JSON):\n${JSON.stringify(compact)}`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  return JSON.parse(block.text) as PortfolioAdvice;
}
