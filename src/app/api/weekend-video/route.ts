import { NextRequest, NextResponse } from "next/server";
import { getWeekendGames, instagramEmbedUrl } from "@/lib/weekend-games";
import { parseInstagramVideo } from "@/lib/instagram-video";

export async function GET(request: NextRequest) {
  const appId = Number(request.nextUrl.searchParams.get("appId"));
  const game = getWeekendGames().find((entry) => entry.steamAppId === appId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const embedUrl = instagramEmbedUrl(game.videoUrl);
  let result: ReturnType<typeof parseInstagramVideo> = { videoUrl: null, reason: "unavailable" };
  if (embedUrl) {
    try {
      const response = await fetch(embedUrl, { signal: AbortSignal.timeout(4500), next: { revalidate: 900 } });
      if (response.ok) {
        const html = await response.text();
        if (html.length <= 2_000_000) {
          const shortcode = new URL(embedUrl).pathname.split("/")[2];
          result = parseInstagramVideo(html, shortcode);
        }
      }
    } catch { /* Keep the official embed available if metadata cannot be fetched. */ }
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } });
}
