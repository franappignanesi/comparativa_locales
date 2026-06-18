import { getCatalogPage } from "../src/lib/catalog";
import { getPriceHistoryReport } from "../src/lib/history";
import { getLatestPrices } from "../src/lib/prices";
import type { RegionId } from "../src/lib/regions";
import { STORES, type StoreId } from "../src/lib/types";

const regions: RegionId[] = ["AR", "MX", "ES", "PE", "CL"];
const probeGameId = "hogwarts-legacy";

const expectedMicrosoftCurrency: Record<RegionId, string> = {
  AR: "ARS",
  MX: "MXN",
  ES: "EUR",
  PE: "PEN",
  CL: "CLP"
};

type CheckResult = {
  region: RegionId;
  catalogRows: number;
  catalogLows: number;
  catalogHistoryEntriesSent: number;
  comparableGames: number;
  onDemandEntries: number;
  microsoftPoints: number;
  microsoftCurrencies: string[];
  pricedRows: number;
  wrongMicrosoftCurrency: number;
  zeroOrNegativeCurrentPrices: number;
  zeroOrNegativeLows: number;
  duplicateStoreDayPointsAfterDedupe: number;
  rawStoreDayPointsRemoved: number;
  storesWithHistory: StoreId[];
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  for (const region of regions) {
    const page = await getCatalogPage({ region, limit: 10, sort: "diferencia" });
    const latest = await getLatestPrices({ region });
    const history = await getPriceHistoryReport(latest, { gameIds: new Set([probeGameId]) });
    const entries = history.entriesByGame[probeGameId] ?? [];
    const dedupedEntries = dedupeStoreDay(entries);
    const microsoftEntries = dedupedEntries.filter((entry) => entry.store === "microsoft");
    const probeRow = latest.prices.find((row) => row.gameId === probeGameId);

    results.push({
      region,
      catalogRows: page.latest.prices.length,
      catalogLows: Object.keys(page.history.lowsByGame).length,
      catalogHistoryEntriesSent: Object.keys(page.history.entriesByGame).length,
      comparableGames: page.analysis.broad.gamesAnalyzed,
      onDemandEntries: dedupedEntries.length,
      microsoftPoints: microsoftEntries.length,
      microsoftCurrencies: [...new Set(microsoftEntries.map((entry) => entry.originalCurrency ?? "null"))],
      pricedRows: latest.prices.filter((row) => Object.values(row.prices).some((price) => price?.available && price.arsFinalPrice != null)).length,
      wrongMicrosoftCurrency: latest.prices.filter((row) => {
        const price = row.prices.microsoft;
        return price?.available && price.arsFinalPrice != null && price.originalCurrency !== expectedMicrosoftCurrency[region];
      }).length,
      zeroOrNegativeCurrentPrices: latest.prices.filter((row) =>
        Object.values(row.prices).some((price) => price?.available && price.arsFinalPrice != null && price.arsFinalPrice <= 0)
      ).length,
      zeroOrNegativeLows: Object.values(history.lowsByGame[probeGameId] ?? {}).filter((low) => low?.arsFinalPrice != null && low.arsFinalPrice <= 0).length,
      duplicateStoreDayPointsAfterDedupe: countStoreDayDuplicates(dedupedEntries),
      rawStoreDayPointsRemoved: entries.filter((entry) => entry.arsFinalPrice != null && entry.arsFinalPrice > 0).length - dedupedEntries.length,
      storesWithHistory: STORES.filter((store) => probeRow?.prices[store]?.available && dedupedEntries.some((entry) => entry.store === store))
    });
  }

  const failures = results.flatMap((result) => {
    const issues: string[] = [];
    if (result.catalogRows !== 10) issues.push(`${result.region}: catalogRows ${result.catalogRows}`);
    if (result.catalogLows === 0) issues.push(`${result.region}: sin minimos en catalogo`);
    if (result.catalogHistoryEntriesSent !== 0) issues.push(`${result.region}: el catalogo envia historial pesado`);
    if (result.comparableGames <= 0) issues.push(`${result.region}: sin juegos comparables`);
    if (result.onDemandEntries === 0) issues.push(`${result.region}: historial on-demand vacio para ${probeGameId}`);
    if (result.microsoftPoints > 1) issues.push(`${result.region}: Microsoft tiene ${result.microsoftPoints} puntos para el mismo grafico`);
    if (result.pricedRows < 1000) issues.push(`${result.region}: pocos juegos con precio actual (${result.pricedRows})`);
    if (result.wrongMicrosoftCurrency > 0) issues.push(`${result.region}: Microsoft con moneda incorrecta (${result.wrongMicrosoftCurrency})`);
    if (result.zeroOrNegativeCurrentPrices > 0) issues.push(`${result.region}: precios actuales <= 0 (${result.zeroOrNegativeCurrentPrices})`);
    if (result.zeroOrNegativeLows > 0) issues.push(`${result.region}: minimos <= 0 (${result.zeroOrNegativeLows})`);
    if (result.duplicateStoreDayPointsAfterDedupe > 0) issues.push(`${result.region}: puntos duplicados por tienda/dia (${result.duplicateStoreDayPointsAfterDedupe})`);
    if (result.storesWithHistory.length === 0) issues.push(`${result.region}: sin tiendas con historial deduplicado`);
    return issues;
  });

  console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));

  if (failures.length) process.exitCode = 1;
}

function dedupeStoreDay(entries: Array<{ store: StoreId; timestamp: string; arsFinalPrice: number | null; originalCurrency?: string | null }>) {
  const byStoreDay = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    if (entry.arsFinalPrice == null || entry.arsFinalPrice <= 0) continue;
    const day = new Date(entry.timestamp).toISOString().slice(0, 10);
    const key = `${entry.store}:${day}`;
    const current = byStoreDay.get(key);
    if (!current || Date.parse(entry.timestamp) >= Date.parse(current.timestamp)) byStoreDay.set(key, entry);
  }
  return [...byStoreDay.values()];
}

function countStoreDayDuplicates(entries: Array<{ store: StoreId; timestamp: string }>): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const entry of entries) {
    const key = `${entry.store}:${new Date(entry.timestamp).toISOString().slice(0, 10)}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}
