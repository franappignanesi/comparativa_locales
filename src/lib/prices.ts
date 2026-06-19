import { dataPath, readJson, writeJson } from "./cache";
import { appendLatestToHistory } from "./history";
import { FALLBACK_USD_TO_ARS, getDigitalTaxRate, getExchangeRate, normalizePrice, type ExchangeRate } from "./normalize";
import { DEFAULT_REGION, type RegionConfig, type RegionId, REGIONS } from "./regions";
import { getGameSample } from "./sample-builder";
import type { LatestPrices, NormalizedPrice, SampleGame, StoreId, StorePrice } from "./types";
import { STORES } from "./types";
import { fetchStorePrice as fetchEpicPrice } from "./stores/epic";
import { fetchStorePrice as fetchGogPrice } from "./stores/gog";
import { fetchStorePrice as fetchHumblePrice } from "./stores/humble";
import { fetchStorePrice as fetchMicrosoftPrice } from "./stores/microsoft";
import { fetchStorePrice as fetchSteamPrice, fetchStorePrices as fetchSteamPrices } from "./stores/steam";

const emptyLatest: LatestPrices = {
  timestamp: null,
  usdToArs: FALLBACK_USD_TO_ARS,
  usdToArsSource: "fallback USD_TO_ARS",
  usdToArsTimestamp: null,
  digitalVatRate: getDigitalTaxRate(DEFAULT_REGION),
  prices: [],
  errors: []
};

const DEFAULT_REFRESH_CONCURRENCY = 8;
const DEFAULT_STALE_HOURS = 96;

export async function getLatestPrices(options: { refresh?: boolean; region?: RegionId } = {}): Promise<LatestPrices> {
  const region = getRegion(options.region);
  const cachePath = latestPricesPath(region.id);
  const cached = await readJson<LatestPrices>(cachePath, emptyLatest);

  if (!options.refresh && cached.timestamp) return withRegionMetadata(cached, region, await getExchangeRate(region.id));

  try {
    const refreshed = await refreshPrices(region.id);
    const hasAnyPricedGame = refreshed.prices.some((game) =>
      Object.values(game.prices).some((price) => price?.available && price.arsFinalPrice != null)
    );

    if (!hasAnyPricedGame && cached.timestamp) return withRegionMetadata(cached, region, await getExchangeRate(region.id));

    await writeJson(cachePath, compactLatestPrices(refreshed));
    await appendLatestToHistory(refreshed);
    return refreshed;
  } catch {
    const exchangeRate = await getExchangeRate(region.id);
    return cached.timestamp ? withRegionMetadata(cached, region, exchangeRate) : withRegionMetadata(emptyLatest, region, exchangeRate);
  }
}

export async function refreshPrices(regionId: RegionId = DEFAULT_REGION): Promise<LatestPrices> {
  const region = getRegion(regionId);
  const sample = await getGameSample();
  const exchangeRate = await getExchangeRate(region.id);
  const games = sample.broadSample;
  const timestamp = new Date().toISOString();
  const { prices, errors } = await buildPriceRows(games, exchangeRate, region, timestamp);

  return {
    timestamp,
    region: region.id,
    currency: exchangeRate.currency,
    locale: exchangeRate.locale,
    usdToArs: exchangeRate.usdToArs,
    usdToArsSource: exchangeRate.source,
    usdToArsTimestamp: exchangeRate.timestamp,
    usdToTarget: exchangeRate.usdToTarget,
    usdToTargetSource: exchangeRate.source,
    usdToTargetTimestamp: exchangeRate.timestamp,
    digitalVatRate: getDigitalTaxRate(region.id),
    prices,
    errors
  };
}

export async function refreshPriceBatch(options: { limit: number; offset: number; region?: RegionId }): Promise<{
  latest: LatestPrices;
  refreshed: number;
  total: number;
  limit: number;
  offset: number;
}> {
  const region = getRegion(options.region);
  const cachePath = latestPricesPath(region.id);
  const cached = await readJson<LatestPrices>(cachePath, emptyLatest);
  const sample = await getGameSample();
  const exchangeRate = await getExchangeRate(region.id);
  const timestamp = new Date().toISOString();
  const limit = Math.max(1, Math.floor(options.limit));
  const offset = Math.max(0, Math.floor(options.offset));
  const selectedGames = sample.broadSample.slice(offset, offset + limit);
  const selectedIds = new Set(selectedGames.map((game) => game.id));
  const { prices: refreshedRows, errors } = await buildPriceRows(selectedGames, exchangeRate, region, timestamp);
  const cachedRowsById = new Map(cached.prices.map((row) => [row.gameId, row]));
  const rowsById = new Map(cachedRowsById);

  for (const row of refreshedRows) {
    rowsById.set(row.gameId, mergeTransientSafe(rowsById.get(row.gameId), row, region.id));
  }

  const mergedRows = sample.broadSample.map((game) => rowsById.get(game.id)).filter((row): row is LatestPrices["prices"][number] => Boolean(row));
  const latest: LatestPrices = {
    timestamp,
    region: region.id,
    currency: exchangeRate.currency,
    locale: exchangeRate.locale,
    usdToArs: exchangeRate.usdToArs,
    usdToArsSource: exchangeRate.source,
    usdToArsTimestamp: exchangeRate.timestamp,
    usdToTarget: exchangeRate.usdToTarget,
    usdToTargetSource: exchangeRate.source,
    usdToTargetTimestamp: exchangeRate.timestamp,
    digitalVatRate: getDigitalTaxRate(region.id),
    prices: mergedRows,
    errors: [
      ...cached.errors.filter((error) => !selectedIds.has(error.gameId)),
      ...errors.filter((error) => !hasCachedValidPrice(cachedRowsById.get(error.gameId), error.store, error.error, region.id))
    ]
  };

  await writeJson(cachePath, compactLatestPrices(latest));
  await appendLatestToHistory({ ...latest, prices: refreshedRows, errors });

  return {
    latest,
    refreshed: refreshedRows.length,
    total: sample.broadSample.length,
    limit,
    offset
  };
}

async function buildPriceRows(
  games: SampleGame[],
  exchangeRate: ExchangeRate,
  region: RegionConfig,
  fetchedAt: string
): Promise<{ prices: LatestPrices["prices"]; errors: LatestPrices["errors"] }> {
  const errors: LatestPrices["errors"] = [];
  const steamChunkSize = 50;
  const steamPrices = await fetchSteamPrices(games.filter((game) => game.availableStores.includes("steam")), steamChunkSize, region);
  const prices = await mapWithConcurrency(games, getRefreshConcurrency(), async (game) => {
    const storePrices: Partial<Record<StoreId, NormalizedPrice>> = {};

    await Promise.all(
      STORES.map(async (store) => {
        if (!game.availableStores.includes(store)) {
        storePrices[store] = withFreshness(normalizePrice({ ...unavailable(game, store, "No esperado en la muestra"), fetchedAt }, exchangeRate));
          return;
        }
        const price = store === "steam" ? steamPrices.get(game.id) ?? (await fetchSteamPrice(game, region)) : await fetchPriceForStore(store, game, region);
        if (price.error) errors.push({ gameId: game.id, store, error: price.error });
        storePrices[store] = withFreshness(normalizePrice({ ...price, fetchedAt: price.fetchedAt ?? fetchedAt }, exchangeRate));
      })
    );

    return {
      gameId: game.id,
      gameTitle: game.title,
      coverUrl: game.coverUrl ?? null,
      primaryTag: game.primaryTag ?? null,
      category: game.category,
      releaseYear: game.releaseYear,
      comparisonStatus: game.comparisonStatus,
      prices: storePrices
    };
  });

  return { prices, errors };
}

function mergeTransientSafe(
  cached: LatestPrices["prices"][number] | undefined,
  refreshed: LatestPrices["prices"][number],
  regionId: RegionId
): LatestPrices["prices"][number] {
  if (!cached) return refreshed;
  const prices = { ...refreshed.prices };
  for (const store of STORES) {
    const next = refreshed.prices[store];
    const previous = cached.prices[store];
    if (isUsableRegionalPrice(previous, regionId) && next?.error) {
      prices[store] = markPreservedPrice(previous, next.error);
    }
  }
  return { ...refreshed, prices };
}

function markPreservedPrice(price: NormalizedPrice, error: string): NormalizedPrice {
  return {
    ...price,
    isStale: true,
    staleReason: `Se conserva precio anterior por error de refresh: ${error}`
  };
}

function hasCachedValidPrice(
  cached: LatestPrices["prices"][number] | undefined,
  store: StoreId,
  error: string,
  regionId: RegionId
): boolean {
  const previous = cached?.prices[store];
  return Boolean(isUsableRegionalPrice(previous, regionId) && error);
}

function isUsableRegionalPrice(price: NormalizedPrice | undefined, regionId: RegionId): price is NormalizedPrice {
  if (!price?.available || price.arsFinalPrice == null) return false;
  const currency = normalizeCurrencyCode(price.originalCurrency ?? price.currency);
  if (!currency) return false;
  const region = getRegion(regionId);
  return currency === "USD" || currency === region.currency;
}

function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (code === "US$") return "USD";
  if (code === "AR$" || code === "$") return "ARS";
  return code;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function getRefreshConcurrency(): number {
  const parsed = Number(process.env.PRICE_REFRESH_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_REFRESH_CONCURRENCY;
}

async function fetchPriceForStore(store: StoreId, game: SampleGame, region: RegionConfig): Promise<StorePrice> {
  if (store === "steam") return fetchSteamPrice(game, region);
  if (store === "epic") return fetchEpicPrice(game, region);
  if (store === "gog") return fetchGogPrice(game, region);
  if (store === "humble") return fetchHumblePrice(game, region);
  return fetchMicrosoftPrice(game, region);
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function getRegion(regionId: RegionId | undefined): RegionConfig {
  return REGIONS.find((region) => region.id === (regionId ?? DEFAULT_REGION)) ?? REGIONS[0];
}

function withRegionMetadata(latest: LatestPrices, region: RegionConfig, exchangeRate: ExchangeRate): LatestPrices {
  return {
    ...latest,
    region: latest.region ?? region.id,
    currency: latest.currency ?? region.currency,
    locale: latest.locale ?? region.locale,
    usdToArs: exchangeRate.usdToArs,
    usdToArsSource: exchangeRate.source,
    usdToArsTimestamp: exchangeRate.timestamp,
    usdToTarget: exchangeRate.usdToTarget,
    usdToTargetSource: exchangeRate.source,
    usdToTargetTimestamp: exchangeRate.timestamp,
    digitalVatRate: getDigitalTaxRate(region.id),
    prices: latest.prices.map((row) => ({
      ...row,
      prices: Object.fromEntries(
        Object.entries(row.prices).map(([store, price]) => [
          store,
          price
            ? withFreshness(
                normalizePrice(
                  {
                    ...price,
                    currency: price.originalCurrency ?? price.currency,
                    finalPrice: price.originalFinalPrice ?? price.finalPrice,
                    basePrice: price.originalBasePrice ?? price.basePrice,
                    fetchedAt: price.fetchedAt ?? null
                  },
                  exchangeRate
                )
              )
            : price
        ])
      ) as LatestPrices["prices"][number]["prices"]
    }))
  };
}

function withFreshness(price: NormalizedPrice): NormalizedPrice {
  const fetchedAt = price.fetchedAt ?? null;
  if (!fetchedAt) {
    return { ...price, fetchedAt, isStale: true, staleReason: "Sin timestamp por tienda" };
  }
  const fetchedTime = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedTime)) {
    return { ...price, isStale: true, staleReason: "Timestamp inválido" };
  }
  const staleHours = parsePositiveNumber(process.env.PRICE_STALE_HOURS) ?? DEFAULT_STALE_HOURS;
  const ageHours = (Date.now() - fetchedTime) / (1000 * 60 * 60);
  const isStale = ageHours > staleHours;
  return {
    ...price,
    isStale,
    staleReason: isStale ? `Precio capturado hace más de ${staleHours} horas` : null
  };
}

function parsePositiveNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function compactLatestPrices(latest: LatestPrices): LatestPrices {
  return {
    ...latest,
    prices: latest.prices.map((row) => ({
      ...row,
      prices: Object.fromEntries(
        Object.entries(row.prices).map(([store, price]) => [store, price ? { ...price, raw: null } : price])
      ) as LatestPrices["prices"][number]["prices"]
    }))
  };
}

function unavailable(game: SampleGame, store: StoreId, error: string): StorePrice {
  return {
    store,
    title: game.title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url: null,
    raw: null,
    error,
    source: "unavailable"
  };
}
