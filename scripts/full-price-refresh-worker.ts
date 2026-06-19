import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { getPriceHistoryReport } from "../src/lib/history";
import { acquireJobLock } from "../src/lib/job-lock";
import { recordRefreshRun } from "../src/lib/operational-store";
import { getLatestPrices, refreshPriceBatch } from "../src/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "../src/lib/regions";

loadEnvConfig(process.cwd());

type WorkerCursor = {
  date: string;
  updatedAt: string | null;
  cursors: Partial<Record<RegionId, number>>;
  completed: Partial<Record<RegionId, string>>;
};

type WorkerStatus = {
  ok: boolean;
  region: RegionId;
  date: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  total: number;
  batchSize: number;
  batchesRun: number;
  refreshed: number;
  startOffset: number;
  nextOffset: number | null;
  errors: number;
  stoppedReason: "completed" | "time_budget" | "max_batches" | "lock_busy" | "error";
  error?: string;
};

const cursorPath = dataPath("generated", "github-full-refresh-cursor.json");
const DEFAULT_MAX_MS = 5.5 * 60 * 60 * 1000;
const DEFAULT_RESERVE_MS = 2 * 60 * 1000;

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  await recordRefreshRun({
    name: "github-full-price-refresh",
    ok: false,
    statusCode: 500,
    summary: { error: message, region: process.env.PRICE_REGION ?? null }
  });
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const regions = parseRegions(process.env.PRICE_REGION ?? process.env.PRICE_REGIONS);
  const results: WorkerStatus[] = [];
  for (const region of regions) {
    results.push(await refreshRegion(region));
  }
  const ok = results.every((result) => result.ok);
  await recordRefreshRun({
    name: "github-full-price-refresh",
    ok,
    statusCode: ok ? 200 : 207,
    summary: { results }
  });
  console.log(JSON.stringify({ ok, results }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function refreshRegion(region: RegionId): Promise<WorkerStatus> {
  const startedAt = new Date().toISOString();
  const date = process.env.FULL_REFRESH_DATE || startedAt.slice(0, 10);
  const batchSize = parsePositiveInt(process.env.FULL_REFRESH_BATCH_SIZE) ?? parsePositiveInt(process.env.PRICE_REFRESH_BATCH_SIZE) ?? 25;
  const maxBatches = parsePositiveInt(process.env.FULL_REFRESH_MAX_BATCHES) ?? Number.MAX_SAFE_INTEGER;
  const sleepMs = parseNonNegativeInt(process.env.FULL_REFRESH_SLEEP_MS) ?? 750;
  const maxMs = parsePositiveInt(process.env.FULL_REFRESH_MAX_MS) ?? DEFAULT_MAX_MS;
  const reserveMs = parsePositiveInt(process.env.FULL_REFRESH_RESERVE_MS) ?? DEFAULT_RESERVE_MS;
  const deadline = Date.now() + maxMs - reserveMs;

  const lock = await acquireJobLock(`github-full-price-refresh-${region}`, {
    ttlMs: maxMs,
    metadata: { region, date, batchSize, maxBatches }
  });
  if (!lock.acquired) {
    return {
      ok: false,
      region,
      date,
      startedAt,
      updatedAt: new Date().toISOString(),
      completedAt: null,
      total: 0,
      batchSize,
      batchesRun: 0,
      refreshed: 0,
      startOffset: 0,
      nextOffset: null,
      errors: 0,
      stoppedReason: "lock_busy",
      error: "Refresh already running for this region"
    };
  }

  try {
    const cursor = normalizeCursor(await readJson<WorkerCursor | null>(cursorPath, null), date);
    let offset = cursor.cursors[region] ?? 0;
    const startOffset = offset;
    let total = 0;
    let batchesRun = 0;
    let refreshed = 0;
    let errors = 0;
    let stoppedReason: WorkerStatus["stoppedReason"] = "completed";

    while (Date.now() < deadline && batchesRun < maxBatches) {
      console.log(JSON.stringify({ event: "batch_start", region, offset, batchSize, batchesRun, elapsedMs: Date.now() - Date.parse(startedAt) }));
      const result = await refreshPriceBatch({ region, limit: batchSize, offset });
      total = result.total;
      refreshed += result.refreshed;
      errors = result.latest.errors.length;
      batchesRun += 1;
      offset += batchSize;
      console.log(JSON.stringify({ event: "batch_done", region, offset, total, batchesRun, refreshed, errors, elapsedMs: Date.now() - Date.parse(startedAt) }));

      if (total > 0 && offset >= total) {
        cursor.cursors[region] = 0;
        cursor.completed[region] = new Date().toISOString();
        cursor.updatedAt = new Date().toISOString();
        await writeJson(cursorPath, cursor);
        if (process.env.FULL_REFRESH_ITAD === "1") {
          const latest = await getLatestPrices({ region });
          await getPriceHistoryReport(latest, { refreshItad: true });
        }
        const status = buildStatus({ ok: true, region, date, startedAt, total, batchSize, batchesRun, refreshed, startOffset, nextOffset: null, errors, stoppedReason: "completed" });
        await writeJson(statusPath(region), status);
        return status;
      }

      cursor.cursors[region] = offset;
      cursor.updatedAt = new Date().toISOString();
      await writeJson(cursorPath, cursor);
      await writeJson(
        statusPath(region),
        buildStatus({ ok: true, region, date, startedAt, total, batchSize, batchesRun, refreshed, startOffset, nextOffset: offset, errors, stoppedReason: "time_budget" })
      );
      if (sleepMs > 0) await sleep(sleepMs);
    }

    stoppedReason = batchesRun >= maxBatches ? "max_batches" : "time_budget";
    const status = buildStatus({ ok: true, region, date, startedAt, total, batchSize, batchesRun, refreshed, startOffset, nextOffset: offset, errors, stoppedReason });
    await writeJson(statusPath(region), status);
    return status;
  } catch (error) {
    const status = buildStatus({
      ok: false,
      region,
      date,
      startedAt,
      total: 0,
      batchSize,
      batchesRun: 0,
      refreshed: 0,
      startOffset: 0,
      nextOffset: null,
      errors: 0,
      stoppedReason: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    await writeJson(statusPath(region), status);
    return status;
  } finally {
    await lock.release();
  }
}

function normalizeCursor(cursor: WorkerCursor | null, date: string): WorkerCursor {
  if (cursor?.date === date) return cursor;
  return { date, updatedAt: null, cursors: {}, completed: {} };
}

function buildStatus(input: Omit<WorkerStatus, "updatedAt" | "completedAt"> & { completedAt?: string | null }): WorkerStatus {
  const updatedAt = new Date().toISOString();
  return {
    ...input,
    updatedAt,
    completedAt: input.stoppedReason === "completed" ? input.completedAt ?? updatedAt : null
  };
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return [DEFAULT_REGION];
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : [DEFAULT_REGION];
}

function statusPath(region: RegionId): string {
  return dataPath("generated", `github-full-refresh-status-${region}.json`);
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
