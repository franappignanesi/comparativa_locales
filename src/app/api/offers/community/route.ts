import { NextResponse } from "next/server";
import { getOfferRanking } from "@/lib/community-offer-store";
import { getLatestPrices } from "@/lib/prices";
import { getGameSample } from "@/lib/sample-builder";
import { expandLatestWithSample } from "@/lib/catalog";
import { steamOfferDiscount } from "@/lib/autumn-offers";
import { REGIONS, type RegionId } from "@/lib/regions";

export async function GET(request: Request) {
  const region = new URL(request.url).searchParams.get("region") ?? "AR";
  if (!REGIONS.some(item => item.id === region)) return NextResponse.json({ message: "Región no válida." }, { status: 400 });
  try {
    const [ranking, latest, sample] = await Promise.all([getOfferRanking(), getLatestPrices({ region: region as RegionId, refresh: false, useCachedExchangeRate: true }), getGameSample()]);
    const rows = new Map(expandLatestWithSample(latest, sample).prices.map(row => [row.gameId, row]));
    const counts: Record<string, number> = {};
    const games = ranking.flatMap(item => {
      const row = rows.get(item.gameId);
      if (!row || steamOfferDiscount(row) <= 0) return [];
      counts[item.gameId] = item.votes;
      const price = row.prices.steam!;
      return [{ gameId: row.gameId, title: row.gameTitle, coverUrl: row.coverUrl, votes: item.votes,
        discount: steamOfferDiscount(row), price: price.originalFinalPrice, currency: price.originalCurrency }];
    }).slice(0, 10);
    return NextResponse.json({ games, counts }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" } });
  } catch {
    return NextResponse.json({ message: "No pudimos cargar las ofertas de la comunidad." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
