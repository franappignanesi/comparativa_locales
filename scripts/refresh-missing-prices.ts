import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { refreshPriceBatch } from "../src/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, StoreId } from "../src/lib/types";
import { STORES } from "../src/lib/types";

loadEnvConfig(process.cwd());

type Status = {
  startedAt: string;
  updatedAt: string;
  done: boolean;
  total: number;
  batchSize: number;
  batchesRun: number;
  lastOffset: number | null;
  coverage: Record<StoreId, number>;
  rowsWithAnyPrice: number;
  errors: number;
};

const startupRegion = parseRegion(process.env.PRICE_REGION);
const statusPath = statusPathForRegion(startupRegion);

main().catch(async (error) => {
  const previous = await readJson<Partial<Status>>(statusPath, {});
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
  const sample = await getGameSample();
  const batchSize = parsePositiveInt(process.env.PRICE_REFRESH_BATCH_SIZE) ?? parsePositiveInt(process.env.PRICE_REFRESH_LIMIT) ?? 100;
  const region = startupRegion;
  const maxBatches = parsePositiveInt(process.env.PRICE_REFRESH_MAX_BATCHES) ?? Number.MAX_SAFE_INTEGER;
  const startOffset = parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET) ?? 0;
  const latest = await readJson<LatestPrices | null>(latestPricesPath(region), null);
  const missingOffsets = findMissingOffsets(sample.broadSample.map((game) => game.id), latest, startOffset, batchSize);
  const startedAt = new Date().toISOString();
  let batchesRun = 0;
  let lastOffset: number | null = null;

  for (const offset of missingOffsets.slice(0, maxBatches)) {
    const result = await refreshPriceBatch({ offset, limit: batchSize, region });
    batchesRun += 1;
    lastOffset = offset;
    await writeJson(statusPath, {
      startedAt,
      updatedAt: new Date().toISOString(),
      done: false,
      total: result.total,
      batchSize,
      batchesRun,
      lastOffset,
      ...summarize(result.latest)
    });
  }

  const finalLatest = await readJson<LatestPrices>(latestPricesPath(region), latest ?? emptyLatest());
  const status: Status = {
    startedAt,
    updatedAt: new Date().toISOString(),
    done: true,
    total: sample.broadSample.length,
    batchSize,
    batchesRun,
    lastOffset,
    ...summarize(finalLatest)
  };
  await writeJson(statusPath, status);
  console.log(JSON.stringify(status, null, 2));
}

function findMissingOffsets(gameIds: string[], latest: LatestPrices | null, startOffset: number, batchSize: number): number[] {
  const rowsById = new Map(latest?.prices.map((row) => [row.gameId, row]) ?? []);
  const offsets = new Set<number>();
  gameIds.forEach((gameId, index) => {
    if (index < startOffset) return;
    const row = rowsById.get(gameId);
    const hasAnyPrice = row && STORES.some((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null);
    const hasFetchFailed = row && Object.values(row.prices).some((price) => price?.error === "fetch failed");
    if (!hasAnyPrice || hasFetchFailed) offsets.add(Math.floor(index / batchSize) * batchSize);
  });
  return [...offsets].sort((a, b) => a - b);
}

function summarize(latest: LatestPrices): Pick<Status, "coverage" | "rowsWithAnyPrice" | "errors"> {
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
    errors: latest.errors.length
  };
}

function emptyLatest(): LatestPrices {
  return {
    timestamp: null,
    usdToArs: 0,
    prices: [],
    errors: []
  };
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parseRegion(value: string | undefined): RegionId {
  return REGIONS.some((item) => item.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function statusPathForRegion(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "refresh-missing-status.json" : `refresh-missing-status-${region}.json`);
}
