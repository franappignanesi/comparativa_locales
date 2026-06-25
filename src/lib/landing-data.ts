import { analyzePrices } from "./analysis";
import { expandLatestWithSample, type CatalogResponse } from "./catalog";
import { getLatestPrices } from "./prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "./regions";
import { getGameSample } from "./sample-builder";

export type LandingStatsPayload = {
  timestamp: string | null;
  region?: string;
  currency?: string;
  locale?: string;
  usdToArs: number;
  usdToArsSource?: string;
  digitalVatRate?: number;
  sampleMeta: {
    strictTotal: number;
    broadTotal: number;
    rejectedTotal: number;
    storeCoverage: Awaited<ReturnType<typeof getGameSample>>["storeCoverage"];
    categoryCoverage: Awaited<ReturnType<typeof getGameSample>>["categoryCoverage"];
    categoryCoverageComparable: Record<string, number>;
  };
  analysis: {
    strict: Omit<ReturnType<typeof analyzePrices>, "games">;
    broad: Omit<ReturnType<typeof analyzePrices>, "games">;
  };
};

export async function getLandingStats(regionId: RegionId = DEFAULT_REGION): Promise<LandingStatsPayload> {
  const region = REGIONS.some((item) => item.id === regionId) ? regionId : DEFAULT_REGION;
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ refresh: false, region, useCachedExchangeRate: true })]);
  const expandedLatest = expandLatestWithSample(latest, sample);
  const strictIds = new Set(sample.strictSample.map((game) => game.id));
  const broadIds = new Set(sample.broadSample.map((game) => game.id));
  const strictAnalysis = analyzePrices(expandedLatest, strictIds);
  const broadAnalysis = analyzePrices(expandedLatest, broadIds);

  return {
    timestamp: latest.timestamp,
    region: latest.region,
    currency: latest.currency,
    locale: latest.locale,
    usdToArs: latest.usdToArs,
    usdToArsSource: latest.usdToArsSource,
    digitalVatRate: latest.digitalVatRate,
    sampleMeta: {
      strictTotal: sample.strictSample.length,
      broadTotal: sample.broadSample.length,
      rejectedTotal: sample.rejected.length,
      storeCoverage: sample.storeCoverage,
      categoryCoverage: sample.categoryCoverage,
      categoryCoverageComparable: comparableCategoryCoverage(expandedLatest, broadAnalysis)
    },
    analysis: {
      strict: compactAnalysis(strictAnalysis),
      broad: compactAnalysis(broadAnalysis)
    }
  };
}

function compactAnalysis<T extends { games: unknown }>(analysis: T): Omit<T, "games"> {
  const { games: _games, ...summary } = analysis;
  return summary;
}

function comparableCategoryCoverage(latest: CatalogResponse["latest"], analysis: ReturnType<typeof analyzePrices>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of latest.prices) {
    if ((analysis.games[row.gameId]?.coverage ?? 0) < 2) continue;
    const label = row.primaryTag?.trim() || "Sin tag Steam";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
