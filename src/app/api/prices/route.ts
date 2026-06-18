import { NextRequest, NextResponse } from "next/server";
import { analyzePrices } from "@/lib/analysis";
import { getPriceHistoryReport } from "@/lib/history";
import { getLatestPrices } from "@/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getGameSample } from "@/lib/sample-builder";

export async function GET(request: NextRequest) {
  const refresh = false;
  const region = parseRegion(request.nextUrl.searchParams.get("region"));
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ refresh, region })]);
  const history = await getPriceHistoryReport(latest, { refreshItad: refresh });
  const strictIds = new Set(sample.strictSample.map((game) => game.id));
  const broadIds = new Set(sample.broadSample.map((game) => game.id));

  return NextResponse.json({
    latest,
    history,
    analysis: {
      strict: analyzePrices(latest, strictIds),
      broad: analyzePrices(latest, broadIds)
    }
  });
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
