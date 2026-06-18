import { NextRequest, NextResponse } from "next/server";
import { buildCsv } from "@/lib/csv";
import { buildMarkdown } from "@/lib/markdown";
import { getLatestPrices } from "@/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getGameSample } from "@/lib/sample-builder";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") === "strict" ? "strict" : "broad";
  const format = request.nextUrl.searchParams.get("format");
  const region = parseRegion(request.nextUrl.searchParams.get("region"));
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ region })]);

  if (format === "md" || format === "markdown") {
    const markdown = buildMarkdown(latest, sample, mode);
    return new NextResponse(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="precios-juegos-${mode}.md"`
      }
    });
  }

  const csv = buildCsv(latest, sample, mode);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="precios-juegos-${mode}.csv"`
    }
  });
}

function parseRegion(value: string | null): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
