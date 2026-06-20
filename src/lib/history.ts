import { dataPath, readJson, writeJson } from "./cache";
import { fetchItadFullHistoryForGames, fetchItadStoreLows } from "./itad";
import { DEFAULT_REGION, REGIONS, type RegionId } from "./regions";
import type { HistoricalLow, LatestPrices, PriceHistoryEntry, PriceHistoryReport, StoreId } from "./types";
import { STORES } from "./types";

type PriceHistoryFile = {
  timestamp: string | null;
  entries: PriceHistoryEntry[];
};

type ItadHistoryFile = {
  timestamp: string | null;
  enabled: boolean;
  source: string;
  matchedGames: number;
  errors: string[];
  entries: PriceHistoryEntry[];
};

const emptyHistory: PriceHistoryFile = { timestamp: null, entries: [] };
const emptyItad: ItadHistoryFile = {
  timestamp: null,
  enabled: false,
  source: "ITAD_API_KEY no configurada",
  matchedGames: 0,
  errors: [],
  entries: []
};
const MIN_FULL_HISTORY_POINTS = 2;
const DEFAULT_OWN_HISTORY_RETENTION_DAYS = 120;

export async function appendLatestToHistory(latest: LatestPrices): Promise<void> {
  if (!latest.timestamp) return;

  const filePath = priceHistoryPath(parseRegion(latest.region));
  const history = await readJson<PriceHistoryFile>(filePath, emptyHistory);
  const byDay = new Map(compactOwnHistory(history.entries).map((entry) => [ownHistoryKey(entry), entry]));

  for (const row of latest.prices) {
    for (const store of STORES) {
      const price = row.prices[store];
      if (!price?.available || price.arsFinalPrice == null) continue;
      const entry: PriceHistoryEntry = {
        gameId: row.gameId,
        gameTitle: row.gameTitle,
        store,
        timestamp: latest.timestamp,
        originalCurrency: price.originalCurrency,
        originalFinalPrice: price.originalFinalPrice,
        originalBasePrice: price.originalBasePrice,
        arsFinalPrice: price.arsFinalPrice,
        arsBasePrice: price.arsBasePrice,
        discountPct: price.discountPct,
        url: price.url,
        source: "snapshot"
      };
      byDay.set(ownHistoryKey(entry), entry);
    }
  }

  await writeJson(filePath, { timestamp: latest.timestamp, entries: compactOwnHistory([...byDay.values()]) });
}

export async function getPriceHistoryReport(
  latest: LatestPrices,
  options: { refreshItad?: boolean; gameIds?: Set<string>; includeFullItad?: boolean } = {}
): Promise<PriceHistoryReport> {
  const ownHistory = await readJson<PriceHistoryFile>(priceHistoryPath(parseRegion(latest.region)), emptyHistory);
  const ownEntries = filterEntriesByGameIds(
    mergeHistoryEntries(filterCompatibleOwnEntries(ownHistory.entries, latest), latestToHistoryEntries(latest)),
    options.gameIds
  );
  const itad = await getItadHistory(latest, options.refreshItad ?? false);
  const fullItad = options.includeFullItad && options.gameIds ? await getFullItadHistory(latest, options.gameIds) : emptyItad;
  const entries = [...ownEntries, ...filterEntriesByGameIds(itad.entries, options.gameIds), ...filterEntriesByGameIds(fullItad.entries, options.gameIds)];
  const lowsByGame = buildLowsByGame(entries, latest);

  return {
    timestamp: new Date().toISOString(),
    ownHistoryStartedAt: firstTimestamp(ownEntries),
    ownSnapshots: new Set(ownEntries.map((entry) => entry.timestamp)).size,
    itad: {
      enabled: itad.enabled || fullItad.enabled,
      timestamp: fullItad.timestamp ?? itad.timestamp,
      source: fullItad.enabled ? `${itad.source}; ${fullItad.source}` : itad.source,
      matchedGames: Math.max(itad.matchedGames, fullItad.matchedGames),
      errors: [...itad.errors, ...fullItad.errors]
    },
    lowsByGame,
    entriesByGame: buildEntriesByGame(entries)
  };
}

async function getFullItadHistory(latest: LatestPrices, gameIds: Set<string>): Promise<ItadHistoryFile> {
  const filePath = itadFullHistoryPath(parseRegion(latest.region));
  const cached = await readJson<ItadHistoryFile>(filePath, emptyItad);
  const cachedCounts = cached.entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.gameId] = (acc[entry.gameId] ?? 0) + 1;
    return acc;
  }, {});
  const missingGameIds = new Set([...gameIds].filter((gameId) => (cachedCounts[gameId] ?? 0) < MIN_FULL_HISTORY_POINTS));
  if (!missingGameIds.size) return cached;

  try {
    const fetched = await fetchItadFullHistoryForGames(latest, missingGameIds);
    const merged = {
      timestamp: fetched.timestamp ?? cached.timestamp,
      enabled: cached.enabled || fetched.enabled,
      source: fetched.enabled ? fetched.source : cached.source,
      matchedGames: Math.max(cached.matchedGames, fetched.matchedGames),
      errors: [...cached.errors, ...fetched.errors],
      entries: mergeHistoryEntries(cached.entries, fetched.entries)
    };
    await writeJson(filePath, merged);
    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al consultar historial completo ITAD";
    return cached.timestamp || cached.entries.length
      ? { ...cached, errors: [...cached.errors, message] }
      : { ...emptyItad, enabled: Boolean(process.env.ITAD_API_KEY), errors: [message] };
  }
}

function filterEntriesByGameIds(entries: PriceHistoryEntry[], gameIds: Set<string> | undefined): PriceHistoryEntry[] {
  if (!gameIds) return entries;
  return entries.filter((entry) => gameIds.has(entry.gameId));
}

function filterCompatibleOwnEntries(entries: PriceHistoryEntry[], latest: LatestPrices): PriceHistoryEntry[] {
  const displayCurrency = latest.currency ?? "ARS";
  return entries.filter((entry) => {
    const currency = entry.originalCurrency?.toUpperCase() ?? null;
    if (entry.store === "microsoft") return currency === displayCurrency;
    return currency === displayCurrency || currency === "USD";
  });
}

function mergeHistoryEntries(...groups: PriceHistoryEntry[][]): PriceHistoryEntry[] {
  const byKey = new Map<string, PriceHistoryEntry>();
  for (const entry of groups.flat()) {
    byKey.set(entryKey(entry), entry);
  }
  return [...byKey.values()];
}

async function getItadHistory(latest: LatestPrices, refresh: boolean): Promise<ItadHistoryFile> {
  const filePath = itadHistoryPath(parseRegion(latest.region));
  const cached = await readJson<ItadHistoryFile>(filePath, emptyItad);
  if (!refresh && cached.timestamp) return cached;

  try {
    const result = await fetchItadStoreLows(latest);
    await writeJson(filePath, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al consultar ITAD";
    if (cached.timestamp) return { ...cached, errors: [...cached.errors, message] };
    return { ...emptyItad, enabled: Boolean(process.env.ITAD_API_KEY), errors: [message] };
  }
}

function latestToHistoryEntries(latest: LatestPrices): PriceHistoryEntry[] {
  if (!latest.timestamp) return [];
  const timestamp = latest.timestamp;
  return latest.prices.flatMap((row) =>
    STORES.flatMap((store) => {
      const price = row.prices[store];
      if (!price?.available || price.arsFinalPrice == null) return [];
      return [
        {
          gameId: row.gameId,
          gameTitle: row.gameTitle,
          store,
          timestamp,
          originalCurrency: price.originalCurrency,
          originalFinalPrice: price.originalFinalPrice,
          originalBasePrice: price.originalBasePrice,
          arsFinalPrice: price.arsFinalPrice,
          arsBasePrice: price.arsBasePrice,
          discountPct: price.discountPct,
          url: price.url,
          source: "snapshot" as const
        }
      ];
    })
  );
}

function buildLowsByGame(entries: PriceHistoryEntry[], latest: LatestPrices): Record<string, Partial<Record<StoreId, HistoricalLow>>> {
  const current = new Map<string, number>();
  for (const row of latest.prices) {
    for (const store of STORES) {
      const price = row.prices[store];
      if (price?.available && price.arsFinalPrice != null) current.set(`${row.gameId}:${store}`, price.arsFinalPrice);
    }
  }

  const lows: Record<string, Partial<Record<StoreId, HistoricalLow>>> = {};
  for (const entry of entries) {
    if (entry.arsFinalPrice == null) continue;
    const currentLow = lows[entry.gameId]?.[entry.store];
    if (currentLow && currentLow.arsFinalPrice != null) {
      const isHigher = currentLow.arsFinalPrice < entry.arsFinalPrice;
      const isEqualOwnOverItad = currentLow.arsFinalPrice === entry.arsFinalPrice && !(currentLow.source === "snapshot" && entry.source === "itad");
      if (isHigher || isEqualOwnOverItad) continue;
    }
    const currentPrice = current.get(`${entry.gameId}:${entry.store}`) ?? null;
    const currentDifferenceArs = currentPrice == null ? null : currentPrice - entry.arsFinalPrice;
    const currentDifferencePct =
      currentPrice == null || entry.arsFinalPrice <= 0 ? null : Math.round((currentPrice / entry.arsFinalPrice - 1) * 100);
    lows[entry.gameId] = {
      ...lows[entry.gameId],
      [entry.store]: {
        ...entry,
        currentDifferenceArs,
        currentDifferencePct
      }
    };
  }
  return lows;
}

function firstTimestamp(entries: PriceHistoryEntry[]): string | null {
  return entries.map((entry) => entry.timestamp).sort()[0] ?? null;
}

function buildEntriesByGame(entries: PriceHistoryEntry[]): Record<string, PriceHistoryEntry[]> {
  const grouped: Record<string, PriceHistoryEntry[]> = {};
  for (const entry of entries) {
    grouped[entry.gameId] = [...(grouped[entry.gameId] ?? []), entry];
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([gameId, gameEntries]) => [
      gameId,
      gameEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    ])
  );
}

function entryKey(entry: PriceHistoryEntry): string {
  return `${entry.gameId}:${entry.store}:${entry.timestamp}`;
}

function ownHistoryKey(entry: PriceHistoryEntry): string {
  return `${entry.gameId}:${entry.store}:${entryDay(entry.timestamp)}`;
}

function compactOwnHistory(entries: PriceHistoryEntry[]): PriceHistoryEntry[] {
  const cutoff = Date.now() - getOwnHistoryRetentionDays() * 24 * 60 * 60 * 1000;
  const byGameStoreDay = new Map<string, PriceHistoryEntry>();
  for (const entry of entries) {
    if (entry.arsFinalPrice == null || entry.arsFinalPrice <= 0) continue;
    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
    const key = ownHistoryKey(entry);
    const current = byGameStoreDay.get(key);
    if (!current || timestamp >= Date.parse(current.timestamp)) byGameStoreDay.set(key, entry);
  }
  return [...byGameStoreDay.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function entryDay(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp.slice(0, 10) : date.toISOString().slice(0, 10);
}

function getOwnHistoryRetentionDays(): number {
  const parsed = Number(process.env.PRICE_HISTORY_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_OWN_HISTORY_RETENTION_DAYS;
}

function parseRegion(value: string | undefined): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

function priceHistoryPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "price-history.json" : `price-history-${region}.json`);
}

function itadHistoryPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "itad-history.json" : `itad-history-${region}.json`);
}

function itadFullHistoryPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "itad-full-history.json" : `itad-full-history-${region}.json`);
}
