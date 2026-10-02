import type { PriceHistoryEntry } from "./types";

export function historyChartObservations(entries: PriceHistoryEntry[], start: Date, end: Date): PriceHistoryEntry[] {
  const byTime = new Map<string, PriceHistoryEntry>();
  for (const entry of entries) {
    const time = Date.parse(entry.timestamp);
    if (entry.kind === "historical_low" || !Number.isFinite(time) || time < start.getTime() || time > end.getTime() || entry.arsFinalPrice == null || entry.arsFinalPrice <= 0) continue;
    const key = `${entry.store}:${time}`;
    const current = byTime.get(key);
    if (!current || entry.source === "snapshot") byTime.set(key, entry);
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
