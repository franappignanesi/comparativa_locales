import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { appendLatestToHistory } from "../src/lib/history";
import { getDigitalTaxRate, getExchangeRate, normalizePrice } from "../src/lib/normalize";
import { DEFAULT_REGION, REGIONS, type RegionConfig, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import { fetchStorePrice as fetchMicrosoftPrice } from "../src/lib/stores/microsoft";
import type { LatestPrices, NormalizedPrice, SampleGame } from "../src/lib/types";

loadEnvConfig(process.cwd());

type Status = {
  timestamp: string;
  regions: Array<{
    region: RegionId;
    offset: number;
    limit: number;
    selected: number;
    refreshed: number;
    preservedStale: number;
    unavailable: number;
    errors: number;
  }>;
};

const DEFAULT_LIMIT = 100;
const DEFAULT_CONCURRENCY = 4;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const sample = await getGameSample();
  const regions = parseRegions(process.env.PRICE_REGIONS ?? process.env.PRICE_REGION);
  const limit = parsePositiveInt(process.env.PRICE_REFRESH_LIMIT) ?? DEFAULT_LIMIT;
  const offset = parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET) ?? 0;
  const concurrency = parsePositiveInt(process.env.PRICE_REFRESH_CONCURRENCY) ?? DEFAULT_CONCURRENCY;
  const timestamp = new Date().toISOString();
  const status: Status = { timestamp, regions: [] };

  for (const regionId of regions) {
    const region = getRegion(regionId);
    const exchangeRate = await getExchangeRate(region.id);
    const cachePath = latestPricesPath(region.id);
    const cached = await readJson<LatestPrices>(cachePath, emptyLatest(region.id));
    const rowsById = new Map(cached.prices.map((row) => [row.gameId, row]));
    const selectedGames = sample.broadSample
      .filter((game) => shouldRefreshMicrosoft(game, rowsById.get(game.id)?.prices.microsoft))
      .slice(offset, offset + limit);

    let refreshed = 0;
    let preservedStale = 0;
    let unavailable = 0;
    const errors: LatestPrices["errors"] = [];

    const refreshedRows = await mapWithConcurrency(selectedGames, concurrency, async (game) => {
      const previousRow = rowsById.get(game.id);
      const previous = previousRow?.prices.microsoft;
      const gameForFetch = withCachedMicrosoftIdentifiers(game, previous);
      const fetched = await fetchMicrosoftPrice(gameForFetch, region);

      let microsoft: NormalizedPrice;
      if (fetched.error && previous?.available && previous.arsFinalPrice != null) {
        preservedStale += 1;
        errors.push({ gameId: game.id, store: "microsoft", error: fetched.error });
        microsoft = {
          ...previous,
          isStale: true,
          staleReason: `No se pudo revalidar Microsoft: ${fetched.error}`
        };
      } else {
        if (fetched.error) errors.push({ gameId: game.id, store: "microsoft", error: fetched.error });
        if (fetched.available && fetched.finalPrice != null) refreshed += 1;
        else unavailable += 1;
        microsoft = normalizePrice({ ...fetched, fetchedAt: fetched.fetchedAt ?? timestamp }, exchangeRate);
      }

      const row: LatestPrices["prices"][number] = {
        gameId: game.id,
        gameTitle: game.title,
        coverUrl: game.coverUrl ?? previousRow?.coverUrl ?? null,
        primaryTag: game.primaryTag ?? previousRow?.primaryTag ?? null,
        category: game.category,
        releaseYear: game.releaseYear,
        comparisonStatus: game.comparisonStatus,
        prices: {
          ...(previousRow?.prices ?? {}),
          microsoft
        }
      };
      return row;
    });

    for (const row of refreshedRows) rowsById.set(row.gameId, row);

    const latest: LatestPrices = {
      timestamp,
      region: region.id,
      currency: exchangeRate.currency,
      locale: exchangeRate.locale,
      usdToArs: exchangeRate.usdToArs,
      usdToArsSource: exchangeRate.source,
      usdToArsTimestamp: exchangeRate.timestamp,
      digitalVatRate: getDigitalTaxRate(region.id),
      prices: sample.broadSample.map((game) => rowsById.get(game.id)).filter((row): row is LatestPrices["prices"][number] => Boolean(row)),
      errors: [
        ...cached.errors.filter((error) => error.store !== "microsoft" || !selectedGames.some((game) => game.id === error.gameId)),
        ...errors
      ]
    };

    await writeJson(cachePath, compactLatestPrices(latest));
    if (refreshedRows.length) await appendLatestToHistory({ ...latest, prices: refreshedRows, errors });
    status.regions.push({
      region: region.id,
      offset,
      limit,
      selected: selectedGames.length,
      refreshed,
      preservedStale,
      unavailable,
      errors: errors.length
    });
  }

  await writeJson(dataPath("generated", "microsoft-refresh-status.json"), status);
  console.log(JSON.stringify(status, null, 2));
}

function shouldRefreshMicrosoft(game: SampleGame, previous: NormalizedPrice | undefined): boolean {
  if (process.env.MICROSOFT_REFRESH_ALL === "1") return true;
  return Boolean(
    game.expectedStores.includes("microsoft") ||
      game.availableStores.includes("microsoft") ||
      game.identifiers.microsoftProductId ||
      game.identifiers.microsoftUrl ||
      previous?.url ||
      previous?.available
  );
}

function withCachedMicrosoftIdentifiers(game: SampleGame, previous: NormalizedPrice | undefined): SampleGame {
  const cachedUrl = previous?.url ?? null;
  const productId = game.identifiers.microsoftProductId ?? extractProductId(game.identifiers.microsoftUrl ?? cachedUrl);
  return {
    ...game,
    expectedStores: game.expectedStores.includes("microsoft") ? game.expectedStores : [...game.expectedStores, "microsoft"],
    availableStores: game.availableStores.includes("microsoft") ? game.availableStores : [...game.availableStores, "microsoft"],
    identifiers: {
      ...game.identifiers,
      microsoftProductId: productId,
      microsoftUrl: game.identifiers.microsoftUrl ?? cachedUrl
    }
  };
}

function extractProductId(url: string | null): string | null {
  if (!url) return null;
  const matches = url.toUpperCase().match(/[A-Z0-9]{12,}/g);
  return matches?.find((match) => match.startsWith("9") || match.startsWith("C") || match.startsWith("B")) ?? null;
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

function compactLatestPrices(latest: LatestPrices): LatestPrices {
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

function emptyLatest(region: RegionId): LatestPrices {
  return {
    timestamp: null,
    region,
    usdToArs: 1852.5,
    prices: [],
    errors: []
  };
}

function getRegion(regionId: RegionId): RegionConfig {
  return REGIONS.find((region) => region.id === regionId) ?? REGIONS[0];
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return [DEFAULT_REGION];
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : [DEFAULT_REGION];
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}
