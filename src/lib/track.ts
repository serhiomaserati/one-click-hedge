/**
 * Local "secured value" tracker (browser only).
 *
 * Records every hedge / take-profit placed through the app in localStorage so we
 * can show "you've secured $X across N trades with One-Click Hedge" — a sticky
 * retention signal and a traction story for the Builders Program. No backend,
 * no PII; lives entirely in the user's browser.
 */
export interface TrackEntry {
  kind: "hedge" | "sell";
  market: string;
  /** Guaranteed/realized P/L locked in by this action, in dollars. */
  locked: number;
  ts: number;
}

const KEY = "och_secured_v1";
const EVENT = "och-trade";

function read(): TrackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrackEntry[]) : [];
  } catch {
    return [];
  }
}

/** Record a placed trade and notify listeners. Returns the updated list. */
export function recordTrade(e: Omit<TrackEntry, "ts">, ts: number): TrackEntry[] {
  if (typeof window === "undefined") return [];
  const all = [...read(), { ...e, ts }];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore quota / private-mode errors */
  }
  return all;
}

export function getTrades(): TrackEntry[] {
  return read();
}

/** { count, secured } where secured sums the positive locked-in values. */
export function getSecuredSummary(): { count: number; secured: number } {
  const all = read();
  const secured = all.reduce((a, e) => a + Math.max(0, e.locked), 0);
  return { count: all.length, secured: Math.round(secured * 100) / 100 };
}

export const TRADE_EVENT = EVENT;
