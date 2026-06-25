import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getLandingStats } from "@/lib/landing-data";

export async function GET(request: NextRequest) {
  try {
    const region = parseRegion(request.nextUrl.searchParams.get("region"));
    return NextResponse.json(await getLandingStats(region));
  } catch (error) {
    console.error("[api/stats] failed", error);
    return NextResponse.json({ error: "stats_failed", message: errorMessage(error) }, { status: 500 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
