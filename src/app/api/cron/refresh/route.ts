import { NextRequest, NextResponse } from "next/server";
import { dataPath, readJson, writeJson } from "@/lib/cache";
import { assertCronSecret } from "@/lib/env";
import { getPriceHistoryReport } from "@/lib/history";
import { acquireJobLock } from "@/lib/job-lock";
import { getLatestPrices, refreshPriceBatch } from "@/lib/prices";
import { recordRefreshRun } from "@/lib/operational-store";
import { runDailyReleaseAutomation } from "@/lib/release-automation";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";

export const dynamic = "force-dynamic";

type RegionRefreshResult = {
  region: RegionId;
  refreshed: number;
  total: number;
  batchSize: number;
  batchesRun: number;
  startOffset: number;
  nextOffset: number | null;
  timestamp: string | null;
  errors: number;
  itadRefreshed?: boolean;
  error?: string;
};

type RefreshCursorFile = {
  updatedAt: string | null;
  cursors: Partial<Record<RegionId, number>>;
};

const refreshCursorPath = dataPath("generated", "price-refresh-cursor.json");
const refreshStatusPath = dataPath("generated", "price-refresh-status.json");

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}

export async function GET(request: NextRequest) {
  return handleRefresh(request);
}

async function handleRefresh(request: NextRequest) {
  const secret = bearerToken(request);
  if (!assertCronSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 });
  }

  const regions = parseRegions(request.nextUrl.searchParams.get("regions") ?? process.env.PRICE_REGIONS);
  const batchSize = parsePositiveInt(request.nextUrl.searchParams.get("batchSize")) ?? parsePositiveInt(process.env.PRICE_REFRESH_BATCH_SIZE) ?? 50;
  const maxBatches = parsePositiveInt(request.nextUrl.searchParams.get("maxBatches")) ?? parsePositiveInt(process.env.PRICE_REFRESH_MAX_BATCHES) ?? 1;
  const explicitOffset = parseNonNegativeInt(request.nextUrl.searchParams.get("offset")) ?? parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET);
  const refreshItad = request.nextUrl.searchParams.get("refreshItad") === "1";
  const results: RegionRefreshResult[] = [];
  let releaseAutomation: unknown = null;

  const lock = await acquireJobLock("price-refresh", {
    ttlMs: parsePositiveInt(process.env.PRICE_REFRESH_LOCK_TTL_MS) ?? 15 * 60 * 1000,
    metadata: { regions, batchSize, maxBatches, refreshItad }
  });

  if (!lock.acquired) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "Refresh ya en ejecucion",
        activeLock: lock.lock,
        timestamp: new Date().toISOString()
      },
      { status: 202 }
    );
  }

  try {
    const cursorFile = await readJson<RefreshCursorFile>(refreshCursorPath, { updatedAt: null, cursors: {} });

    for (const region of regions) {
      const startOffset = explicitOffset ?? cursorFile.cursors[region] ?? 0;
      let offset = startOffset;
      let refreshed = 0;
      let total = 0;
      let timestamp: string | null = null;
      let errors = 0;
      let batchesRun = 0;

      try {
        for (let batch = 0; batch < maxBatches; batch += 1) {
          const result = await refreshPriceBatch({ region, limit: batchSize, offset });
          refreshed += result.refreshed;
          total = result.total;
          timestamp = result.latest.timestamp;
          errors = result.latest.errors.length;
          batchesRun += 1;
          offset += batchSize;
          if (offset >= result.total) break;
        }

        if (refreshItad) {
          const latest = await getLatestPrices({ region });
          await getPriceHistoryReport(latest, { refreshItad: true });
        }

        results.push({
          region,
          refreshed,
          total,
          batchSize,
          batchesRun,
          startOffset,
          nextOffset: total > 0 && offset < total ? offset : null,
          timestamp,
          errors,
          itadRefreshed: refreshItad
        });
        cursorFile.cursors[region] = total > 0 && offset < total ? offset : 0;
      } catch (error) {
        results.push({
          region,
          refreshed,
          total,
          batchSize,
          batchesRun,
          startOffset,
          nextOffset: offset,
          timestamp,
          errors,
          error: error instanceof Error ? error.message : String(error)
        });
        cursorFile.cursors[region] = offset;
      }
    }

    try {
      releaseAutomation = await runDailyReleaseAutomation();
    } catch (error) {
      releaseAutomation = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    cursorFile.updatedAt = new Date().toISOString();
    await writeJson(refreshCursorPath, cursorFile);

    const failures = results.filter((result) => result.error);
    const response = {
      ok: failures.length === 0,
      timestamp: new Date().toISOString(),
      results,
      releaseAutomation
    };
    await writeJson(refreshStatusPath, response);
    const status = failures.length ? 207 : 200;
    await recordRefreshRun({ name: "price-refresh", ok: failures.length === 0, statusCode: status, summary: response });
    return NextResponse.json(response, { status });
  } finally {
    await lock.release();
  }
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function parseRegions(value: string | null | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : [DEFAULT_REGION];
}

function parsePositiveInt(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
