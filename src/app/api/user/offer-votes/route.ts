import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import { getOfferVotes, setOfferVote, OFFER_VOTE_LIMIT, OFFER_VOTE_TAG } from "@/lib/community-offer-store";
import { suggestionBody, suggestionError, suggestionOriginAllowed } from "@/lib/game-suggestion-http";
import { suggestionRateLimit } from "@/lib/game-suggestion-store";
import { expandLatestWithSample } from "@/lib/catalog";
import { getLatestPrices } from "@/lib/prices";
import { getGameSample } from "@/lib/sample-builder";
import { steamOfferDiscount } from "@/lib/autumn-offers";
import { REGIONS, type RegionId } from "@/lib/regions";

function response(votes: string[], status = 200) {
  return NextResponse.json({ votes, limit: OFFER_VOTE_LIMIT, ...(status === 409 ? { message: "Ya usaste tus cinco votos. Quitá uno para elegir otra oferta." } : {}) }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(request: Request) {
  const user = getCurrentUser(request);
  if (!user) return suggestionError("Iniciá sesión para votar.", 401);
  try { return response(await getOfferVotes(user.sub)); }
  catch { return suggestionError("No pudimos cargar tus votos. Probá nuevamente.", 503); }
}
export async function PUT(request: Request) {
  const user = getCurrentUser(request);
  if (!user) return suggestionError("Iniciá sesión para votar.", 401);
  if (!suggestionOriginAllowed(request)) return suggestionError("Solicitud no permitida.", 403);
  let body;
  try { body = await suggestionBody(request); } catch { return suggestionError("Solicitud no válida."); }
  if (typeof body.gameId !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(body.gameId) || typeof body.voted !== "boolean"
    || !REGIONS.some(region => region.id === body.region)) return suggestionError("Revisá la oferta elegida.");
  try {
    if (!await suggestionRateLimit(user.sub, "offer-vote", 30, 60)) return suggestionError("Esperá un minuto antes de volver a votar.", 429);
    if (body.voted) {
      const [latest, sample] = await Promise.all([getLatestPrices({ region: body.region as RegionId, refresh: false, useCachedExchangeRate: true }), getGameSample()]);
      if (!expandLatestWithSample(latest, sample).prices.some(row => row.gameId === body.gameId && steamOfferDiscount(row) > 0)) return suggestionError("Esta oferta ya no está disponible en Steam.");
    }
    const votes = await setOfferVote(user.sub, body.gameId, body.voted);
    revalidateTag(OFFER_VOTE_TAG, { expire: 0 });
    return response(votes, body.voted && !votes.includes(body.gameId) ? 409 : 200);
  } catch {
    console.error("[offer-votes] storage unavailable");
    return suggestionError("No pudimos guardar el voto. Probá nuevamente.", 503);
  }
}
