import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { getGameSample } from "@/lib/sample-builder";
import { getLatestPrices } from "@/lib/prices";
import { getPriceHistoryReport } from "@/lib/history";
import { REGIONS, DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { buildPublicationGame, publicationAssetUrl } from "@/lib/social-publications";

export async function GET(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) return unauthorized();
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  const headers = { "Cache-Control": "private, no-store" };
  const sample = await getGameSample();
  const gameId = request.nextUrl.searchParams.get("gameId");
  if (!gameId) {
    const query = normalize(request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
    const games = sample.broadSample.filter(game => !query || normalize(game.title).includes(query)).slice(0, 20);
    return NextResponse.json({ games: games.map(game => ({ id: game.id, title: game.title })) }, { headers });
  }
  const game = sample.broadSample.find(game => game.id === gameId);
  if (!game) return NextResponse.json({ error: "No encontramos el juego" }, { status: 404, headers });
  if (request.nextUrl.searchParams.get("asset") === "1") {
    const url = publicationAssetUrl(game.coverUrl ?? "");
    if (!url) return NextResponse.json({ error: "Imagen no disponible" }, { status: 404, headers });
    try {
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
      const type = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type) || !response.body) throw new Error("Invalid image");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 3 * 1024 * 1024) { await reader.cancel(); throw new Error("Image too large"); }
        chunks.push(value);
      }
      return new NextResponse(Buffer.concat(chunks), { headers: { ...headers, "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
    } catch {
      return NextResponse.json({ error: "No pudimos cargar la imagen del juego" }, { status: 502, headers });
    }
  }
  const value = request.nextUrl.searchParams.get("region");
  const region: RegionId = REGIONS.some(item => item.id === value) ? value as RegionId : DEFAULT_REGION;
  const latest = await getLatestPrices({ region, refresh: false, useCachedExchangeRate: true });
  const row = latest.prices.find(item => item.gameId === game.id) ?? {
    gameId: game.id, gameTitle: game.title, category: game.category, releaseYear: game.releaseYear,
    comparisonStatus: game.comparisonStatus, prices: {}
  };
  const history = await getPriceHistoryReport(latest, { refreshItad: false, gameIds: new Set([game.id]) });
  const publication = buildPublicationGame({ ...row, coverUrl: game.coverUrl ?? row.coverUrl }, latest, history.lowsByGame[game.id] ?? {}, region);
  publication.coverUrl = publicationAssetUrl(game.coverUrl ?? row.coverUrl ?? "")
    ? `/api/admin/publications?asset=1&gameId=${encodeURIComponent(game.id)}` : null;
  return NextResponse.json({ game: publication }, { headers });
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
