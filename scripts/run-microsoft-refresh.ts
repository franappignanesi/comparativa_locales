import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { appendLatestToHistory } from "../src/lib/history";
import { getDigitalTaxRate, getExchangeRate, normalizePrice } from "../src/lib/normalize";
import { acquireJobLock } from "../src/lib/job-lock";
import { DEFAULT_REGION, REGIONS, type RegionConfig, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import { fetchStorePrice as fetchMicrosoftPrice } from "../src/lib/stores/microsoft";
import type { LatestPrices, NormalizedPrice, SampleGame } from "../src/lib/types";

loadEnvConfig(process.cwd());

type RegionRunStatus = {
  region: RegionId;
  done: boolean;
  batchesRun: number;
  lastOffset: number | null;
  nextOffset: number | null;
  selected: number;
  refreshed: number;
  preservedStale: number;
  unavailable: number;
  errors: number;
  error?: string;
};

type RunnerStatus = {
  startedAt: string;
  updatedAt: string;
  done: boolean;
  regions: Partial<Record<RegionId, RegionRunStatus>>;
};

type RefreshCursor = {
  updatedAt: string;
  done: boolean;
  regionIndex: number;
  offset: number;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_BATCHES = 12;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_SLEEP_MS = 2500;

const statusPath = dataPath("generated", "microsoft-refresh-runner-status.json");
const cursorPath = dataPath("generated", "microsoft-refresh-cursor.json");

main().catch(async (error) => {
  const previous = await readJson<Partial<RunnerStatus>>(statusPath, {});
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
  const regions = parseRegions(process.env.PRICE_REGIONS ?? process.env.PRICE_REGION);
  const batchSize = parsePositiveInt(process.env.PRICE_REFRESH_BATCH_SIZE) ?? parsePositiveInt(process.env.PRICE_REFRESH_LIMIT) ?? DEFAULT_BATCH_SIZE;
  const maxBatches = parsePositiveInt(process.env.PRICE_REFRESH_MAX_BATCHES) ?? DEFAULT_MAX_BATCHES;
  const concurrency = parsePositiveInt(process.env.PRICE_REFRESH_CONCURRENCY) ?? DEFAULT_CONCURRENCY;
  const sleepMs = parseNonNegativeInt(process.env.PRICE_REFRESH_SLEEP_MS) ?? DEFAULT_SLEEP_MS;
  const explicitStartOffset = parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET);
  const resume = process.env.MICROSOFT_REFRESH_RESUME !== "0" && explicitStartOffset == null;
  const cursor = resume ? await readJson<RefreshCursor>(cursorPath, emptyCursor()) : emptyCursor();
  if (resume && cursor.done) {
    const finishedAt = new Date().toISOString();
    const doneStatus: RunnerStatus = { startedAt: finishedAt, updatedAt: finishedAt, done: true, regions: {} };
    await writeJson(statusPath, doneStatus);
    console.log(JSON.stringify({ status: "already_done", cursor }, null, 2));
    return;
  }
  const startedAt = new Date().toISOString();
  const runnerStatus: RunnerStatus = { startedAt, updatedAt: startedAt, done: false, regions: {} };
  await writeJson(statusPath, runnerStatus);
  const lock = await acquireJobLock("microsoft-refresh", {
    ttlMs: parsePositiveInt(process.env.MICROSOFT_REFRESH_LOCK_TTL_MS) ?? 10 * 60 * 1000,
    metadata: { regions, batchSize, maxBatches, concurrency, resume }
  });
  if (!lock.acquired) {
    runnerStatus.updatedAt = new Date().toISOString();
    runnerStatus.done = false;
    await writeJson(statusPath, {
      ...runnerStatus,
      skipped: true,
      reason: "Microsoft refresh ya en ejecucion",
      activeLock: lock.lock
    });
    console.log(JSON.stringify({ status: "skipped_locked", activeLock: lock.lock }, null, 2));
    return;
  }

  try {
    for (let regionIndex = resume ? cursor.regionIndex : 0; regionIndex < regions.length; regionIndex += 1) {
    const regionId = regions[regionIndex];
    const regionStartOffset = regionIndex === cursor.regionIndex ? cursor.offset : 0;
    let completedRegion = false;
    const regionStatus: RegionRunStatus = {
      region: regionId,
      done: false,
      batchesRun: 0,
      lastOffset: null,
      nextOffset: 0,
      selected: 0,
      refreshed: 0,
      preservedStale: 0,
      unavailable: 0,
      errors: 0
    };
    runnerStatus.regions[regionId] = regionStatus;
    await writeJson(statusPath, runnerStatus);

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const offset = (explicitStartOffset ?? regionStartOffset) + batch * batchSize;
      try {
        regionStatus.nextOffset = offset;
        runnerStatus.updatedAt = new Date().toISOString();
        await writeJson(statusPath, runnerStatus);
        console.log(JSON.stringify({ region: regionId, offset, status: "starting" }));
        const result = await refreshMicrosoftBatch({ sample: sample.broadSample, regionId, offset, limit: batchSize, concurrency });
        regionStatus.batchesRun += 1;
        regionStatus.lastOffset = offset;
        regionStatus.nextOffset = result.selected < batchSize ? null : offset + batchSize;
        regionStatus.selected = result.selected;
        regionStatus.refreshed += result.refreshed;
        regionStatus.preservedStale += result.preservedStale;
        regionStatus.unavailable += result.unavailable;
        regionStatus.errors += result.errors;
        runnerStatus.updatedAt = new Date().toISOString();
        await writeJson(statusPath, runnerStatus);
        console.log(JSON.stringify({ region: regionId, offset, ...result }));
        const nextCursor =
          result.selected < batchSize
            ? nextRegionCursor(regionIndex, regions.length)
            : { updatedAt: new Date().toISOString(), done: false, regionIndex, offset: offset + batchSize };
        await writeJson(cursorPath, nextCursor);
        if (result.selected < batchSize) {
          completedRegion = true;
          break;
        }
      } catch (error) {
        regionStatus.error = error instanceof Error ? error.message : String(error);
        break;
      }
      if (sleepMs > 0) await sleep(sleepMs);
    }
    regionStatus.done = completedRegion;
    runnerStatus.updatedAt = new Date().toISOString();
    await writeJson(statusPath, runnerStatus);
    if (!completedRegion) {
      await writeJson(cursorPath, {
        updatedAt: runnerStatus.updatedAt,
        done: false,
        regionIndex,
        offset: regionStatus.nextOffset ?? regionStartOffset
      });
      break;
    }
    }

    runnerStatus.done = Object.values(runnerStatus.regions).every((region) => region?.done);
    runnerStatus.updatedAt = new Date().toISOString();
    if (runnerStatus.done) {
      await writeJson(cursorPath, { updatedAt: runnerStatus.updatedAt, done: true, regionIndex: regions.length, offset: 0 });
    }
    await writeJson(statusPath, runnerStatus);
    console.log(JSON.stringify(runnerStatus, null, 2));
  } finally {
    await lock.release();
  }
}

async function refreshMicrosoftBatch(options: {
  sample: SampleGame[];
  regionId: RegionId;
  offset: number;
  limit: number;
  concurrency: number;
}): Promise<{ selected: number; refreshed: number; preservedStale: number; unavailable: number; errors: number }> {
  const region = getRegion(options.regionId);
  const exchangeRate = await getExchangeRate(region.id);
  const cachePath = latestPricesPath(region.id);
  const cached = await readJson<LatestPrices>(cachePath, emptyLatest(region.id));
  const rowsById = new Map(cached.prices.map((row) => [row.gameId, row]));
  const timestamp = new Date().toISOString();
  const selectedGames = options.sample
    .filter((game) => shouldRefreshMicrosoft(game, rowsById.get(game.id)?.prices.microsoft))
    .slice(options.offset, options.offset + options.limit);

  let refreshed = 0;
  let preservedStale = 0;
  let unavailable = 0;
  const errors: LatestPrices["errors"] = [];

  const refreshedRows = await mapWithConcurrency(selectedGames, options.concurrency, async (game) => {
    const previousRow = rowsById.get(game.id);
    const previous = previousRow?.prices.microsoft;
    const fetched = await fetchMicrosoftPrice(withCachedMicrosoftIdentifiers(game, previous), region);
    let microsoft: NormalizedPrice;

    if (fetched.error && previous?.available && previous.arsFinalPrice != null) {
      preservedStale += 1;
      errors.push({ gameId: game.id, store: "microsoft", error: fetched.error });
      microsoft = { ...previous, isStale: true, staleReason: `No se pudo revalidar Microsoft: ${fetched.error}` };
    } else {
      if (fetched.error) errors.push({ gameId: game.id, store: "microsoft", error: fetched.error });
      if (fetched.available && fetched.finalPrice != null) refreshed += 1;
      else unavailable += 1;
      microsoft = normalizePrice({ ...fetched, fetchedAt: fetched.fetchedAt ?? timestamp }, exchangeRate);
    }

    return {
      gameId: game.id,
      gameTitle: game.title,
      coverUrl: game.coverUrl ?? previousRow?.coverUrl ?? null,
      primaryTag: game.primaryTag ?? previousRow?.primaryTag ?? null,
      category: game.category,
      releaseYear: game.releaseYear,
      comparisonStatus: game.comparisonStatus,
      prices: { ...(previousRow?.prices ?? {}), microsoft }
    } satisfies LatestPrices["prices"][number];
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
    prices: options.sample.map((game) => rowsById.get(game.id)).filter((row): row is LatestPrices["prices"][number] => Boolean(row)),
    errors: [
      ...cached.errors.filter((error) => error.store !== "microsoft" || !selectedGames.some((game) => game.id === error.gameId)),
      ...errors
    ]
  };

  await writeJson(cachePath, compactLatestPrices(latest));
  if (refreshedRows.length) await appendLatestToHistory({ ...latest, prices: refreshedRows, errors });
  return { selected: selectedGames.length, refreshed, preservedStale, unavailable, errors: errors.length };
}

function shouldRefreshMicrosoft(game: SampleGame, previous: NormalizedPrice | undefined): boolean {
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

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
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

function extractProductId(url: string | null): string | null {
  if (!url) return null;
  const matches = url.toUpperCase().match(/[A-Z0-9]{12,}/g);
  return matches?.find((match) => match.startsWith("9") || match.startsWith("C") || match.startsWith("B")) ?? null;
}

function emptyLatest(region: RegionId): LatestPrices {
  return { timestamp: null, region, usdToArs: 1852.5, prices: [], errors: [] };
}

function getRegion(regionId: RegionId): RegionConfig {
  return REGIONS.find((region) => region.id === regionId) ?? REGIONS[0];
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyCursor(): RefreshCursor {
  return { updatedAt: new Date().toISOString(), done: false, regionIndex: 0, offset: 0 };
}

function nextRegionCursor(regionIndex: number, regionCount: number): RefreshCursor {
  const nextRegionIndex = regionIndex + 1;
  return {
    updatedAt: new Date().toISOString(),
    done: nextRegionIndex >= regionCount,
    regionIndex: nextRegionIndex,
    offset: 0
  };
}
