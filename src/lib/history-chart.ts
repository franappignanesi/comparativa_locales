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
  const ordered = [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const series = new Map<string, PriceHistoryEntry[]>();
  for (const entry of ordered) {
    const storeEntries = series.get(entry.store) ?? [];
    storeEntries.push(entry);
    series.set(entry.store, storeEntries);
  }
  const compacted: PriceHistoryEntry[] = [];
  for (const storeEntries of series.values()) {
    // Keep both ends of each unchanged-price interval, including the latest observation.
    for (let index = 0; index < storeEntries.length; index++) {
      const entry = storeEntries[index];
      const samePrice = (other: PriceHistoryEntry | undefined) => other != null && Math.round(other.arsFinalPrice! * 100) === Math.round(entry.arsFinalPrice! * 100);
      if (!samePrice(storeEntries[index - 1]) || !samePrice(storeEntries[index + 1])) compacted.push(entry);
    }
  }
  return compacted.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
