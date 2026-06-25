import { analyzePrices, type AnalysisSummary } from "./analysis";
import { getPriceHistoryReport } from "./history";
import { getLatestPrices } from "./prices";
import { DEFAULT_REGION, type RegionId } from "./regions";
import { getGameSample } from "./sample-builder";
import type { GameSample, LatestPrices, NormalizedPrice, PriceHistoryReport, StoreId } from "./types";
import { STORES } from "./types";

export type CatalogMode = "strict" | "broad";

export type CatalogParams = {
  mode?: CatalogMode;
  query?: string;
  category?: string;
  filter?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  refresh?: boolean;
  region?: RegionId;
  useCachedExchangeRate?: boolean;
};

export type CatalogResponse = {
  latest: LatestPrices;
  history: PriceHistoryReport;
  analysis: {
    strict: AnalysisSummary;
    broad: AnalysisSummary;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  sampleMeta: {
    strictTotal: number;
    broadTotal: number;
    rejectedTotal: number;
  };
};

type PriceRow = LatestPrices["prices"][number];

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

export async function getCatalogPage(params: CatalogParams = {}): Promise<CatalogResponse> {
  const region = params.region ?? DEFAULT_REGION;
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ refresh: params.refresh, region, useCachedExchangeRate: params.useCachedExchangeRate })]);
  const strictIds = new Set(sample.strictSample.map((game) => game.id));
  const broadIds = new Set(sample.broadSample.map((game) => game.id));
  const expandedLatest = expandLatestWithSample(latest, sample);
  const analysis = {
    strict: analyzePrices(expandedLatest, strictIds),
    broad: analyzePrices(expandedLatest, broadIds)
  };
  const mode = params.mode === "strict" ? "strict" : "broad";
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const filtered = filterAndSortRows(expandedLatest.prices, sample, analysis[mode], { ...params, mode });
  const rows = compactRows(filtered.slice(offset, offset + limit));
  const pageGameIds = new Set(rows.map((row) => row.gameId));
  const history = await getPriceHistoryReport(expandedLatest, { refreshItad: params.refresh, gameIds: pageGameIds });

  return {
    latest: {
      ...expandedLatest,
      prices: rows,
      errors: expandedLatest.errors.filter((error) => pageGameIds.has(error.gameId))
    },
    history: sliceHistory(history, pageGameIds),
    analysis: {
      strict: sliceAnalysis(analysis.strict, pageGameIds),
      broad: sliceAnalysis(analysis.broad, pageGameIds)
    },
    pagination: {
      total: filtered.length,
      limit,
      offset,
      hasMore: offset + rows.length < filtered.length
    },
    sampleMeta: {
      strictTotal: sample.strictSample.length,
      broadTotal: sample.broadSample.length,
      rejectedTotal: sample.rejected.length
    }
  };
}

export function expandLatestWithSample(latest: LatestPrices, sample: GameSample): LatestPrices {
  const rowsById = new Map(latest.prices.map((row) => [row.gameId, row]));
  const prices = sample.broadSample.map((game) => {
    const existing = rowsById.get(game.id);
    if (existing) {
      return {
        ...existing,
        coverUrl: existing.coverUrl ?? game.coverUrl ?? null,
        primaryTag: existing.primaryTag ?? game.primaryTag ?? null,
        category: game.category,
        releaseYear: game.releaseYear,
        comparisonStatus: game.comparisonStatus
      };
    }
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
  });

  return {
    ...latest,
    prices
  };
}

function filterAndSortRows(
  rows: PriceRow[],
  sample: GameSample,
  analysis: AnalysisSummary,
  params: CatalogParams & { mode: CatalogMode }
): PriceRow[] {
  const selectedSample = params.mode === "strict" ? sample.strictSample : sample.broadSample;
  const ids = new Set(selectedSample.map((game) => game.id));
  const normalizedQuery = (params.query ?? "").trim().toLowerCase();
  const category = params.category ?? "todas";
  const filter = params.filter ?? "todos";
  const sort = params.sort ?? "diferencia";

  return rows
    .filter((row) => ids.has(row.gameId))
    .filter((row) => !normalizedQuery || row.gameTitle.toLowerCase().includes(normalizedQuery))
    .filter((row) => hasAnyCurrentPrice(row))
    .filter((row) => {
      if (category === "todas") return true;
      if (steamCategory(row) === category) return true;
      if (category === "AAA") return row.category === "AAA nuevo" || row.category === "AAA viejo";
      return row.category === category;
    })
    .filter((row) => {
      const gameAnalysis = analysis.games[row.gameId];
      if (filter === "ofertas") return Object.values(row.prices).some((price) => (price?.discountPct ?? 0) > 0);
      if (filter === "diferencias") return (gameAnalysis?.differenceVsSteam ?? 0) < -1000;
      if (filter === "revision") return Boolean(gameAnalysis?.needsReview);
      if (filter === "completos") return gameAnalysis?.coverage === STORES.length;
      return true;
    })
    .sort((a, b) => (filter === "ofertas" ? maxDiscountPct(b) - maxDiscountPct(a) : compareRows(a, b, analysis, sort)));
}

function hasAnyCurrentPrice(row: PriceRow): boolean {
  return STORES.some((store) => {
    const price = row.prices[store];
    return Boolean(price?.available && price.arsFinalPrice != null);
  });
}

function maxDiscountPct(row: PriceRow): number {
  return Math.max(0, ...STORES.map((store) => discountPct(row.prices[store]) ?? 0));
}

function discountPct(price: PriceRow["prices"][StoreId]): number | null {
  if (!price?.available) return null;
  if (typeof price.discountPct === "number" && Number.isFinite(price.discountPct) && price.discountPct > 0) {
    return Math.round(price.discountPct);
  }
  if (price.arsBasePrice != null && price.arsFinalPrice != null && price.arsBasePrice > price.arsFinalPrice) {
    return Math.round((1 - price.arsFinalPrice / price.arsBasePrice) * 100);
  }
  return null;
}

function steamCategory(row: PriceRow): string {
  return row.primaryTag?.trim() || row.category;
}

function compareRows(a: PriceRow, b: PriceRow, analysis: AnalysisSummary, sort: string): number {
  const analysisA = analysis.games[a.gameId];
  const analysisB = analysis.games[b.gameId];
  if (sort === "precio") {
    return (analysisA?.winnerPrice ?? Number.MAX_SAFE_INTEGER) - (analysisB?.winnerPrice ?? Number.MAX_SAFE_INTEGER);
  }
  if (sort === "cobertura") return (analysisB?.coverage ?? 0) - (analysisA?.coverage ?? 0);
  if (sort === "nombre") return a.gameTitle.localeCompare(b.gameTitle);
  return (analysisA?.differenceVsSteam ?? Number.MAX_SAFE_INTEGER) - (analysisB?.differenceVsSteam ?? Number.MAX_SAFE_INTEGER);
}

function sliceHistory(history: PriceHistoryReport, gameIds: Set<string>): PriceHistoryReport {
  return {
    ...history,
    lowsByGame: Object.fromEntries(Object.entries(history.lowsByGame).filter(([gameId]) => gameIds.has(gameId))),
    entriesByGame: {}
  };
}

function sliceAnalysis(summary: AnalysisSummary, gameIds: Set<string>): AnalysisSummary {
  return {
    ...summary,
    games: Object.fromEntries(Object.entries(summary.games).filter(([gameId]) => gameIds.has(gameId)))
  };
}

function compactRows(rows: PriceRow[]): PriceRow[] {
  return rows.map((row) => ({
    ...row,
    prices: Object.fromEntries(
      Object.entries(row.prices).map(([store, price]) => [store, price ? compactPrice(price) : price])
    ) as PriceRow["prices"]
  }));
}

function compactPrice(price: NormalizedPrice): NormalizedPrice {
  return {
    ...price,
    raw: null
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT)));
}
