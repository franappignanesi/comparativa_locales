import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { refreshPriceBatch } from "../src/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, StoreId } from "../src/lib/types";
import { STORES } from "../src/lib/types";

loadEnvConfig(process.cwd());

type RegionStatus = {
  region: RegionId;
  startedAt: string;
  updatedAt: string;
  done: boolean;
  total: number;
  batchSize: number;
  batchesRun: number;
  lastOffset: number | null;
  nextOffset: number | null;
  coverage: Record<StoreId, number>;
  rowsWithAnyPrice: number;
  rowsWithTwoOrMoreStores: number;
  errors: number;
  error?: string;
};

type GlobalStatus = {
  startedAt: string;
  updatedAt: string;
  done: boolean;
  regions: Partial<Record<RegionId, RegionStatus>>;
};

const globalStatusPath = dataPath("generated", "regional-refresh-status.json");

main().catch(async (error) => {
  const previous = await readJson<Partial<GlobalStatus>>(globalStatusPath, {});
  await writeJson(globalStatusPath, {
    ...previous,
    updatedAt: new Date().toISOString(),
    done: false,
    error: error instanceof Error ? error.message : String(error)
  });
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const sample = await getGameSample();
  const regions = parseRegions(process.env.PRICE_REGIONS);
  const batchSize = parsePositiveInt(process.env.PRICE_REFRESH_BATCH_SIZE) ?? parsePositiveInt(process.env.PRICE_REFRESH_LIMIT) ?? 50;
  const maxBatchesPerRegion = parsePositiveInt(process.env.PRICE_REFRESH_MAX_BATCHES) ?? Number.MAX_SAFE_INTEGER;
  const startOffset = parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET) ?? 0;
  const sleepMs = parseNonNegativeInt(process.env.PRICE_REFRESH_SLEEP_MS) ?? 1500;
  const startedAt = new Date().toISOString();
  const globalStatus: GlobalStatus = {
    startedAt,
    updatedAt: startedAt,
    done: false,
    regions: {}
  };

  await writeJson(globalStatusPath, globalStatus);

  for (const region of regions) {
    const statusPath = regionStatusPath(region);
    const latest = await readJson<LatestPrices | null>(latestPricesPath(region), null);
    const offsets = findRefreshOffsets(sample.broadSample.map((game) => game.id), latest, startOffset, batchSize);
    let batchesRun = 0;
    let lastOffset: number | null = null;

    for (const offset of offsets.slice(0, maxBatchesPerRegion)) {
      try {
        const result = await refreshPriceBatch({ offset, limit: batchSize, region });
        batchesRun += 1;
        lastOffset = offset;
        const nextOffset = offsets[offsets.indexOf(offset) + 1] ?? null;
        const regionStatus = buildStatus({
          region,
          startedAt,
          done: false,
          total: result.total,
          batchSize,
          batchesRun,
          lastOffset,
          nextOffset,
          latest: result.latest
        });
        globalStatus.regions[region] = regionStatus;
        globalStatus.updatedAt = regionStatus.updatedAt;
        await writeJson(statusPath, regionStatus);
        await writeJson(globalStatusPath, globalStatus);
      } catch (error) {
        const fallbackLatest = await readJson<LatestPrices>(latestPricesPath(region), emptyLatest(region));
        const regionStatus = {
          ...buildStatus({
            region,
            startedAt,
            done: false,
            total: sample.broadSample.length,
            batchSize,
            batchesRun,
            lastOffset,
            nextOffset: offset,
            latest: fallbackLatest
          }),
          error: error instanceof Error ? error.message : String(error)
        };
        globalStatus.regions[region] = regionStatus;
        globalStatus.updatedAt = regionStatus.updatedAt;
        await writeJson(statusPath, regionStatus);
        await writeJson(globalStatusPath, globalStatus);
      }

      if (sleepMs > 0) await sleep(sleepMs);
    }

    const finalLatest = await readJson<LatestPrices>(latestPricesPath(region), latest ?? emptyLatest(region));
    const finalStatus = buildStatus({
      region,
      startedAt,
      done: true,
      total: sample.broadSample.length,
      batchSize,
      batchesRun,
      lastOffset,
      nextOffset: null,
      latest: finalLatest
    });
    globalStatus.regions[region] = finalStatus;
    globalStatus.updatedAt = finalStatus.updatedAt;
    await writeJson(statusPath, finalStatus);
    await writeJson(globalStatusPath, globalStatus);
  }

  globalStatus.done = true;
  globalStatus.updatedAt = new Date().toISOString();
  await writeJson(globalStatusPath, globalStatus);
  console.log(JSON.stringify(globalStatus, null, 2));
}

function findRefreshOffsets(gameIds: string[], latest: LatestPrices | null, startOffset: number, batchSize: number): number[] {
  const rowsById = new Map(latest?.prices.map((row) => [row.gameId, row]) ?? []);
  const offsets = new Set<number>();
  gameIds.forEach((gameId, index) => {
    if (index < startOffset) return;
    const row = rowsById.get(gameId);
    const pricedStores = STORES.filter((store) => row?.prices[store]?.available && row?.prices[store]?.arsFinalPrice != null).length;
    const hasFetchFailed = row && Object.values(row.prices).some((price) => price?.error === "fetch failed");
    if (!row || pricedStores === 0 || hasFetchFailed) offsets.add(Math.floor(index / batchSize) * batchSize);
  });
  return [...offsets].sort((a, b) => a - b);
}

function buildStatus(params: {
  region: RegionId;
  startedAt: string;
  done: boolean;
  total: number;
  batchSize: number;
  batchesRun: number;
  lastOffset: number | null;
  nextOffset: number | null;
  latest: LatestPrices;
}): RegionStatus {
  return {
    region: params.region,
    startedAt: params.startedAt,
    updatedAt: new Date().toISOString(),
    done: params.done,
    total: params.total,
    batchSize: params.batchSize,
    batchesRun: params.batchesRun,
    lastOffset: params.lastOffset,
    nextOffset: params.nextOffset,
    ...summarize(params.latest)
  };
}

function summarize(latest: LatestPrices): Pick<RegionStatus, "coverage" | "rowsWithAnyPrice" | "rowsWithTwoOrMoreStores" | "errors"> {
  return {
    coverage: Object.fromEntries(
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
    ).length,
    errors: latest.errors.length
  };
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
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

function regionStatusPath(region: RegionId): string {
  return dataPath("generated", `regional-refresh-status-${region}.json`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
