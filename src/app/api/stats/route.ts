import { NextRequest, NextResponse } from "next/server";
import { analyzePrices } from "@/lib/analysis";
import { expandLatestWithSample } from "@/lib/catalog";
import { getLatestPrices } from "@/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getGameSample } from "@/lib/sample-builder";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const region = parseRegion(request.nextUrl.searchParams.get("region"));
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ refresh, region })]);
  const expandedLatest = expandLatestWithSample(latest, sample);
  const strictIds = new Set(sample.strictSample.map((game) => game.id));
  const broadIds = new Set(sample.broadSample.map((game) => game.id));
  const strictAnalysis = analyzePrices(expandedLatest, strictIds);
  const broadAnalysis = analyzePrices(expandedLatest, broadIds);

  return NextResponse.json({
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
  });
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

function compactAnalysis<T extends { games: unknown }>(analysis: T): Omit<T, "games"> {
  const { games: _games, ...summary } = analysis;
  return summary;
}

function comparableCategoryCoverage(latest: ReturnType<typeof expandLatestWithSample>, analysis: ReturnType<typeof analyzePrices>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of latest.prices) {
    if ((analysis.games[row.gameId]?.coverage ?? 0) < 2) continue;
    const label = row.primaryTag?.trim() || "Sin tag Steam";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
