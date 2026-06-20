import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { getExchangeRate, normalizePrice } from "../src/lib/normalize";
import { REGIONS, type RegionId } from "../src/lib/regions";
import { STORES, type LatestPrices, type NormalizedPrice, type PriceHistoryEntry, type StoreId } from "../src/lib/types";

loadEnvConfig(process.cwd());

type PriceHistoryFile = {
  timestamp: string | null;
  entries: PriceHistoryEntry[];
};

const emptyHistory: PriceHistoryFile = { timestamp: null, entries: [] };
const emptyLatest: LatestPrices = { timestamp: null, usdToArs: 0, prices: [], errors: [] };
const maxAgeDays = parsePositiveInt(process.env.RESTORE_PRICE_MAX_AGE_DAYS) ?? 30;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const summaries = [];
  for (const region of REGIONS) {
    summaries.push(await restoreRegion(region.id));
  }
  console.log(JSON.stringify({ ok: true, maxAgeDays, summaries }, null, 2));
}

async function restoreRegion(region: RegionId): Promise<{ region: RegionId; restored: number; sanitized: number; rows: number }> {
  const latestPath = latestPricesPath(region);
  const historyPath = priceHistoryPath(region);
  const latest = await readJson<LatestPrices>(latestPath, emptyLatest);
  const history = await readJson<PriceHistoryFile>(historyPath, emptyHistory);
  if (!latest.timestamp || !latest.prices.length || !history.entries.length) return { region, restored: 0, sanitized: 0, rows: latest.prices.length };

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const regionConfig = REGIONS.find((item) => item.id === region);
  const displayCurrency = regionConfig?.currency ?? "ARS";
  const latestHistory = new Map<string, PriceHistoryEntry>();
  for (const entry of history.entries) {
    if (entry.arsFinalPrice == null || entry.arsFinalPrice <= 0) continue;
    if (!isCompatibleHistoryEntry(entry, displayCurrency)) continue;
    const time = Date.parse(entry.timestamp);
    if (!Number.isFinite(time) || time < cutoff) continue;
    const key = `${entry.gameId}:${entry.store}`;
    const current = latestHistory.get(key);
    if (!current || time >= Date.parse(current.timestamp)) latestHistory.set(key, entry);
  }

  const exchangeRate = await getExchangeRate(region);
  let restored = 0;
  let sanitized = 0;
  const prices = latest.prices.map((row) => {
    const nextPrices = { ...row.prices };
    for (const store of STORES) {
      const current = nextPrices[store];
      if (current?.available && current.arsFinalPrice != null && !isCompatibleCurrentPrice(current, displayCurrency)) {
        delete nextPrices[store];
        sanitized += 1;
      }
    }
    for (const store of STORES) {
      const current = nextPrices[store];
      if (current?.available && current.arsFinalPrice != null) continue;
      const entry = latestHistory.get(`${row.gameId}:${store}`);
      if (!entry) continue;
      nextPrices[store] = restoredPrice(entry, store, row.gameTitle, exchangeRate);
      restored += 1;
    }
    return { ...row, prices: nextPrices };
  });

  const repaired: LatestPrices = {
    ...latest,
    prices,
    errors: latest.errors.filter((error) => !(prices.find((row) => row.gameId === error.gameId)?.prices[error.store]?.available))
  };
  if (restored > 0 || sanitized > 0) await writeJson(latestPath, repaired);
  return { region, restored, sanitized, rows: latest.prices.length };
}

function restoredPrice(
  entry: PriceHistoryEntry,
  store: StoreId,
  title: string,
  exchangeRate: Awaited<ReturnType<typeof getExchangeRate>>
): NormalizedPrice {
  const normalized = normalizePrice(
    {
      store,
      title,
      available: true,
      basePrice: entry.originalBasePrice,
      finalPrice: entry.originalFinalPrice,
      currency: entry.originalCurrency,
      discountPct: entry.discountPct,
      url: entry.url,
      raw: null,
      source: "cache",
      fetchedAt: entry.timestamp
    },
    exchangeRate
  );
  return {
    ...normalized,
    arsFinalPrice: entry.arsFinalPrice,
    arsBasePrice: entry.arsBasePrice,
    isStale: true,
    staleReason: "Restaurado desde historial por fallo de refresh"
  };
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function priceHistoryPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "price-history.json" : `price-history-${region}.json`);
}

function isCompatibleHistoryEntry(entry: PriceHistoryEntry, displayCurrency: string): boolean {
  const currency = normalizeCurrencyCode(entry.originalCurrency);
  if (!currency) return false;
  if (entry.store === "microsoft") return currency === displayCurrency;
  return currency === displayCurrency || currency === "USD";
}

function isCompatibleCurrentPrice(price: NormalizedPrice, displayCurrency: string): boolean {
  const currency = normalizeCurrencyCode(price.originalCurrency ?? price.currency);
  if (!currency) return false;
  if (price.store === "microsoft") return currency === displayCurrency;
  return currency === displayCurrency || currency === "USD";
}

function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (code === "US$") return "USD";
  if (code === "AR$" || code === "$") return "ARS";
  return code;
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
