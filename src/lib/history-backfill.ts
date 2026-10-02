import type { PriceHistoryEntry } from "./types";

export type FullHistoryArchive = {
  timestamp: string | null;
  enabled: boolean;
  source: string;
  matchedGames: number;
  errors: string[];
  entries: PriceHistoryEntry[];
  checkedGames?: Record<string, string>;
};

export function mergeFullHistoryArchive(current: FullHistoryArchive, incoming: FullHistoryArchive): FullHistoryArchive {
  const entries = new Map<string, PriceHistoryEntry>();
  for (const entry of [...current.entries, ...incoming.entries]) {
    if (entry.kind === "historical_low" || !Number.isFinite(Date.parse(entry.timestamp)) || (entry.arsFinalPrice ?? 0) <= 0) continue;
    entries.set(`${entry.gameId}:${entry.store}:${entry.timestamp}`, entry);
  }
  return {
    ...current,
    timestamp: incoming.timestamp ?? current.timestamp,
    enabled: current.enabled || incoming.enabled,
    source: incoming.enabled ? incoming.source : current.source,
    matchedGames: Math.max(current.matchedGames, incoming.matchedGames),
    errors: incoming.errors,
    entries: [...entries.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    checkedGames: { ...current.checkedGames, ...incoming.checkedGames }
  };
}
