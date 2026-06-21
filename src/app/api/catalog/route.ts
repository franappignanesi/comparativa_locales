import { NextRequest, NextResponse } from "next/server";
import { getCatalogPage, type CatalogMode } from "@/lib/catalog";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const response = NextResponse.json(
      await getCatalogPage({
        mode: parseMode(params.get("mode")),
        query: params.get("query") ?? "",
        category: params.get("category") ?? "todas",
        filter: params.get("filter") ?? "todos",
        sort: params.get("sort") ?? "diferencia",
        limit: parseNumber(params.get("limit")),
        offset: parseNumber(params.get("offset")),
        region: parseRegion(params.get("region")),
        refresh: false
      })
    );
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    return response;
  } catch (error) {
    console.error("[api/catalog] failed", error);
    return NextResponse.json({ error: "catalog_failed", message: errorMessage(error) }, { status: 500 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

function parseMode(value: string | null): CatalogMode {
  return value === "strict" ? "strict" : "broad";
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
