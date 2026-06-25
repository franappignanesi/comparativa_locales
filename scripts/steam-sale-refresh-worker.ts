import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { appendLatestToHistory } from "../src/lib/history";
import { getExchangeRate, normalizePrice } from "../src/lib/normalize";
import { getLatestPrices } from "../src/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionConfig, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import { fetchStorePrices as fetchSteamPrices } from "../src/lib/stores/steam";
import type { LatestPrices, NormalizedPrice, SampleGame } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SaleWindow = {
  name: string;
  startsAt: string;
  endsAt: string;
};

type CursorFile = {
  sale: string | null;
  updatedAt: string | null;
  cursors: Partial<Record<RegionId, number>>;
  completed: Partial<Record<RegionId, string>>;
};

type RegionStatus = {
  ok: boolean;
  skipped?: boolean;
  region: RegionId;
  sale: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  total: number;
  batchSize: number;
  maxBatches: number;
  batchesRun: number;
  refreshed: number;
  startOffset: number;
  nextOffset: number | null;
  errors: number;
  stoppedReason: "completed" | "inactive_sale" | "time_budget" | "max_batches" | "error";
  error?: string;
};

const cursorPath = dataPath("generated", "steam-sale-refresh-cursor.json");
const calendarPath = dataPath("steam-sale-calendar.json");
const DEFAULT_MAX_MS = 18 * 60 * 1000;
const DEFAULT_RESERVE_MS = 90 * 1000;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const now = new Date();
  const sale = await currentSale(now);
  const forced = process.env.FORCE_STEAM_SALE_REFRESH === "1";
  const regions = parseRegions(process.env.PRICE_REGIONS ?? process.env.PRICE_REGION);

  if (!sale && !forced) {
    const results = regions.map((region) =>
      buildStatus({
        ok: true,
        skipped: true,
        region,
        sale: null,
        startedAt: now.toISOString(),
        total: 0,
        batchSize: 0,
        maxBatches: 0,
        batchesRun: 0,
        refreshed: 0,
        startOffset: 0,
        nextOffset: null,
        errors: 0,
        stoppedReason: "inactive_sale"
      })
    );
    console.log(JSON.stringify({ ok: true, activeSale: null, results }, null, 2));
    return;
  }

  const results: RegionStatus[] = [];
  for (const region of regions) {
    results.push(await refreshRegion(region, sale?.name ?? "manual"));
  }

  const ok = results.every((result) => result.ok);
  console.log(JSON.stringify({ ok, activeSale: sale?.name ?? "manual", results }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function refreshRegion(regionId: RegionId, saleName: string): Promise<RegionStatus> {
  const startedAt = new Date().toISOString();
  const batchSize = parsePositiveInt(process.env.STEAM_SALE_BATCH_SIZE) ?? 100;
  const maxBatches = parsePositiveInt(process.env.STEAM_SALE_MAX_BATCHES) ?? 3;
  const maxMs = parsePositiveInt(process.env.STEAM_SALE_MAX_MS) ?? DEFAULT_MAX_MS;
  const reserveMs = parsePositiveInt(process.env.STEAM_SALE_RESERVE_MS) ?? DEFAULT_RESERVE_MS;
  const deadline = Date.now() + maxMs - reserveMs;
  const region = getRegion(regionId);

  try {
    const cursor = normalizeCursor(await readJson<CursorFile | null>(cursorPath, null), saleName);
    const sample = await getGameSample();
    const latest = await getLatestPrices({ region: region.id });
    const exchangeRate = await getExchangeRate(region.id);
    const games = prioritizeGames(sample.broadSample.filter((game) => game.availableStores.includes("steam") && game.identifiers.steamAppId));
    const rowsById = new Map(latest.prices.map((row) => [row.gameId, row]));
    let offset = Math.min(cursor.cursors[region.id] ?? 0, games.length);
    const startOffset = offset;
    let batchesRun = 0;
    let refreshed = 0;
    let errors = 0;
    const updatedRows: LatestPrices["prices"] = [];
    let stoppedReason: RegionStatus["stoppedReason"] = "completed";

    while (Date.now() < deadline && batchesRun < maxBatches && offset < games.length) {
      const selected = games.slice(offset, offset + batchSize);
      console.log(JSON.stringify({ event: "steam_sale_batch_start", region: region.id, offset, batchSize: selected.length, batchesRun }));
      const steamPrices = await fetchSteamPrices(selected, parsePositiveInt(process.env.STEAM_CHUNK_SIZE) ?? 25, region);
      const timestamp = new Date().toISOString();

      for (const game of selected) {
        const steamPrice = steamPrices.get(game.id);
        if (!steamPrice?.available || steamPrice.finalPrice == null) {
          if (steamPrice?.error) errors += 1;
          continue;
        }
        const normalized = normalizePrice({ ...steamPrice, fetchedAt: steamPrice.fetchedAt ?? timestamp }, exchangeRate);
        if (normalized.arsFinalPrice == null) {
          errors += 1;
          continue;
        }
        const row = rowsById.get(game.id) ?? emptyRow(game);
        const nextRow = {
          ...row,
          prices: {
            ...row.prices,
            steam: markFresh(normalized)
          }
        };
        rowsById.set(game.id, nextRow);
        updatedRows.push(nextRow);
        refreshed += 1;
      }

      batchesRun += 1;
      offset += selected.length;
      cursor.cursors[region.id] = offset;
      cursor.updatedAt = new Date().toISOString();
      await writeJson(cursorPath, cursor);
      console.log(JSON.stringify({ event: "steam_sale_batch_done", region: region.id, offset, total: games.length, batchesRun, refreshed, errors }));
    }

    if (offset >= games.length) {
      cursor.cursors[region.id] = 0;
      cursor.completed[region.id] = new Date().toISOString();
      stoppedReason = "completed";
    } else {
      stoppedReason = batchesRun >= maxBatches ? "max_batches" : "time_budget";
    }
    cursor.updatedAt = new Date().toISOString();

    const timestamp = new Date().toISOString();
    const mergedLatest: LatestPrices = {
      ...latest,
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
      digitalVatRate: region.digitalTaxRate,
      prices: sample.broadSample.map((game) => rowsById.get(game.id)).filter((row): row is LatestPrices["prices"][number] => Boolean(row)),
      errors: latest.errors.filter((error) => error.store !== "steam")
    };

    await writeJson(latestPricesPath(region.id), compactLatest(mergedLatest));
    if (updatedRows.length) {
      await appendLatestToHistory({ ...mergedLatest, prices: updatedRows });
    }
    await writeJson(cursorPath, cursor);

    const status = buildStatus({
      ok: true,
      region: region.id,
      sale: saleName,
      startedAt,
      total: games.length,
      batchSize,
      maxBatches,
      batchesRun,
      refreshed,
      startOffset,
      nextOffset: offset >= games.length ? null : offset,
      errors,
      stoppedReason
    });
    await writeJson(statusPath(region.id), status);
    return status;
  } catch (error) {
    const status = buildStatus({
      ok: false,
      region: region.id,
      sale: saleName,
      startedAt,
      total: 0,
      batchSize,
      maxBatches,
      batchesRun: 0,
      refreshed: 0,
      startOffset: 0,
      nextOffset: null,
      errors: 0,
      stoppedReason: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    await writeJson(statusPath(region.id), status);
    return status;
  }
}

async function currentSale(now: Date): Promise<SaleWindow | null> {
  const calendar = await readJson<SaleWindow[]>(calendarPath, []);
  return calendar.find((sale) => Date.parse(sale.startsAt) <= now.getTime() && now.getTime() <= Date.parse(sale.endsAt)) ?? null;
}

function normalizeCursor(cursor: CursorFile | null, sale: string): CursorFile {
  if (cursor?.sale === sale) return cursor;
  return { sale, updatedAt: null, cursors: {}, completed: {} };
}

function prioritizeGames(games: SampleGame[]): SampleGame[] {
  return [...games].sort((a, b) => priorityScore(b) - priorityScore(a));
}

function priorityScore(game: SampleGame): number {
  let score = 0;
  if (game.comparisonStatus === "valid_all_stores") score += 40;
  if (game.confidence === "high") score += 25;
  if (game.releaseYear >= 2020) score += 10;
  if (game.primaryTag === "Action" || game.primaryTag === "Adventure" || game.primaryTag === "RPG") score += 5;
  return score;
}

function emptyRow(game: SampleGame): LatestPrices["prices"][number] {
  return {
    gameId: game.id,
    gameTitle: game.title,
    coverUrl: game.coverUrl ?? null,
    primaryTag: game.primaryTag ?? null,
    category: game.category,
    releaseYear: game.releaseYear,
    comparisonStatus: game.comparisonStatus,
    prices: {}
  };
}

function markFresh(price: NormalizedPrice): NormalizedPrice {
  return { ...price, isStale: false, staleReason: null, raw: null };
}

function compactLatest(latest: LatestPrices): LatestPrices {
  return {
    ...latest,
    prices: latest.prices.map((row) => ({
      ...row,
      prices: Object.fromEntries(Object.entries(row.prices).map(([store, price]) => [store, price ? { ...price, raw: null } : price])) as LatestPrices["prices"][number]["prices"]
    }))
  };
}

function buildStatus(input: Omit<RegionStatus, "updatedAt" | "completedAt"> & { completedAt?: string | null }): RegionStatus {
  const updatedAt = new Date().toISOString();
  return {
    ...input,
    updatedAt,
    completedAt: input.stoppedReason === "completed" ? input.completedAt ?? updatedAt : null
  };
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function statusPath(region: RegionId): string {
  return dataPath("generated", `steam-sale-refresh-status-${region}.json`);
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
