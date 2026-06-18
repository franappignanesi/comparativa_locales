import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { fetchItadCurrentPrices } from "../src/lib/itad";
import { getDigitalTaxRate, getExchangeRate } from "../src/lib/normalize";
import { REGIONS, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, SampleGame, StoreId } from "../src/lib/types";
import { STORES } from "../src/lib/types";

loadEnvConfig(process.cwd());

type BackfillStatus = {
  startedAt: string;
  updatedAt: string;
  done: boolean;
  regions: Partial<Record<RegionId, RegionBackfillStatus>>;
};

type RegionBackfillStatus = {
  region: RegionId;
  updatedAt: string;
  matchedGames: number;
  updatedPrices: number;
  shopCoverage: Partial<Record<StoreId, number>>;
  cacheCoverage: Record<StoreId, number>;
  rowsWithAnyPrice: number;
  rowsWithTwoOrMoreStores: number;
  errors: string[];
};

const statusPath = dataPath("generated", "itad-regional-backfill-status.json");

main().catch(async (error) => {
  const previous = await readJson<Partial<BackfillStatus>>(statusPath, {});
  await writeJson(statusPath, {
    ...previous,
    updatedAt: new Date().toISOString(),
    done: false,
    error: error instanceof Error ? error.message : String(error)
  });
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sample = await getGameSample();
  const regions = parseRegions(process.env.PRICE_REGIONS);
  const status: BackfillStatus = {
    startedAt,
    updatedAt: startedAt,
    done: false,
    regions: {}
  };
  await writeJson(statusPath, status);

  for (const regionId of regions) {
    const region = REGIONS.find((item) => item.id === regionId);
    if (!region) continue;

    const cachePath = latestPricesPath(region.id);
    const cached = await readJson<LatestPrices>(cachePath, emptyLatest(region.id));
    const exchangeRate = await getExchangeRate(region.id);
    const result = await fetchItadCurrentPrices(sample.broadSample, region, exchangeRate);
    const latest = mergeItadPrices(cached, result.prices, sample.broadSample);

    latest.timestamp = new Date().toISOString();
    latest.region = region.id;
    latest.currency = exchangeRate.currency;
    latest.locale = exchangeRate.locale;
    latest.usdToArs = exchangeRate.usdToArs;
    latest.usdToArsSource = exchangeRate.source;
    latest.usdToArsTimestamp = exchangeRate.timestamp;
    latest.digitalVatRate = getDigitalTaxRate(region.id);
    latest.notes = appendNote(latest.notes, `ITAD regional current-price backfill ${latest.timestamp}`);

    await writeJson(cachePath, latest);

    const regionStatus: RegionBackfillStatus = {
      region: region.id,
      updatedAt: new Date().toISOString(),
      matchedGames: result.matchedGames,
      updatedPrices: result.updatedPrices,
      shopCoverage: result.shopCoverage,
      ...summarize(latest),
      errors: result.errors
    };
    status.regions[region.id] = regionStatus;
    status.updatedAt = regionStatus.updatedAt;
    await writeJson(statusPath, status);
  }

  status.done = true;
  status.updatedAt = new Date().toISOString();
  await writeJson(statusPath, status);
  console.log(JSON.stringify(status, null, 2));
}

function mergeItadPrices(cached: LatestPrices, itadPrices: Map<string, LatestPrices["prices"][number]["prices"]>, games: SampleGame[]): LatestPrices {
  const cachedRows = new Map(cached.prices.map((row) => [row.gameId, row]));
  const rows = games.map((game) => {
    const cachedRow = cachedRows.get(game.id);
    const row = cachedRow ?? {
      gameId: game.id,
      gameTitle: game.title,
      coverUrl: game.coverUrl ?? null,
      primaryTag: game.primaryTag ?? null,
      category: game.category,
      releaseYear: game.releaseYear,
      comparisonStatus: game.comparisonStatus,
      prices: {}
    };
    const fromItad = itadPrices.get(game.id);
    const cleanedPrices = Object.fromEntries(
      STORES.map((store) => {
        const price = row.prices[store];
        if (price?.source === "itad" && ((price.originalFinalPrice ?? 0) <= 0 || (price.arsFinalPrice ?? 0) <= 0)) {
          return [store, undefined];
        }
        return [store, price];
      }).filter(([, price]) => price)
    ) as LatestPrices["prices"][number]["prices"];
    if (!fromItad) return { ...row, prices: cleanedPrices };
    return {
      ...row,
      prices: mergeStorePrices(cleanedPrices, fromItad)
    };
  });

  return {
    ...cached,
    prices: rows,
    errors: cached.errors.filter((error) => {
      const price = itadPrices.get(error.gameId)?.[error.store];
      return !(price?.available && price.arsFinalPrice != null);
    })
  };
}

function mergeStorePrices(
  existing: LatestPrices["prices"][number]["prices"],
  fromItad: LatestPrices["prices"][number]["prices"]
): LatestPrices["prices"][number]["prices"] {
  const merged = { ...existing };
  for (const store of STORES) {
    const current = existing[store];
    const next = fromItad[store];
    if (!next) continue;
    if (shouldKeepExistingOverItad(current)) continue;
    merged[store] = next;
  }
  return merged;
}

function shouldKeepExistingOverItad(price: LatestPrices["prices"][number]["prices"][StoreId] | undefined): boolean {
  if (!price?.available || price.arsFinalPrice == null) return false;
  return price.source === "live" || price.source === "manual";
}

function summarize(latest: LatestPrices): Pick<RegionBackfillStatus, "cacheCoverage" | "rowsWithAnyPrice" | "rowsWithTwoOrMoreStores"> {
  return {
    cacheCoverage: Object.fromEntries(
      STORES.map((store) => [
        store,
        latest.prices.filter((row) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null).length
      ])
    ) as Record<StoreId, number>,
    rowsWithAnyPrice: latest.prices.filter((row) =>
      STORES.some((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null)
    ).length,
    rowsWithTwoOrMoreStores: latest.prices.filter((row) =>
      STORES.filter((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null).length >= 2
    ).length
  };
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : REGIONS.map((region) => region.id);
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function emptyLatest(region: RegionId): LatestPrices {
  return {
    timestamp: null,
    region,
    usdToArs: 0,
    prices: [],
    errors: []
  };
}

function appendNote(notes: string | undefined, note: string): string {
  return notes ? `${notes}\n${note}` : note;
}
