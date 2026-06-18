import { NextRequest, NextResponse } from "next/server";
import { getPriceHistoryReport } from "@/lib/history";
import { getLatestPrices } from "@/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";

export async function GET(request: NextRequest) {
  const refreshItad = request.nextUrl.searchParams.get("refreshItad") === "1";
  const includeFullItad = request.nextUrl.searchParams.get("full") === "1";
  const region = parseRegion(request.nextUrl.searchParams.get("region"));
  const gameId = request.nextUrl.searchParams.get("gameId");
  const latest = await getLatestPrices({ region });
  const history = await getPriceHistoryReport(latest, { refreshItad, includeFullItad, gameIds: gameId ? new Set([gameId]) : undefined });

  if (gameId) {
    return NextResponse.json({
      ...history,
      lowsByGame: history.lowsByGame[gameId] ? { [gameId]: history.lowsByGame[gameId] } : {},
      entriesByGame: { [gameId]: history.entriesByGame[gameId] ?? [] }
    });
  }

  return NextResponse.json(history);
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
