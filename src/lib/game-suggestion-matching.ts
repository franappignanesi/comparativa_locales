import { EXCLUDED_PRODUCT, normalizedCatalogTitle, isPackTitle } from "./catalog-expansion";
import type { GameCandidate, SampleGame, StoreId } from "./types";
import type { SuggestionPreview } from "./game-suggestion-types";
import { findMicrosoftPrice, hasMicrosoftPcPurchase } from "./stores/microsoft";

type Json = <T>(url: string, body?: unknown) => Promise<T>;
type Info = { id: string; title: string; type: string; appid?: number | null; releaseDate?: string | null; tags?: string[]; assets?: { banner400?: string } };
type SteamApp = { name: string; type?: string; platforms?: { windows?: boolean }; is_free?: boolean; header_image?: string; release_date?: { date?: string; coming_soon?: boolean }; genres?: Array<{ description: string }>; apps?: Array<{ id: number }> };
const shops: Record<number, StoreId> = { 61: "steam", 16: "epic", 35: "gog", 37: "humble" };

export function sameSuggestionEdition(a: string, b: string) { return normalizedCatalogTitle(a) === normalizedCatalogTitle(b); }
export async function matchGameSuggestion(preview: SuggestionPreview, json: Json): Promise<GameCandidate> {
  if (!preview.title) throw Error("No pudimos identificar el título desde la tienda. Requiere revisión manual.");
  if (EXCLUDED_PRODUCT.test(preview.title)) throw Error("DLC, upgrades y contenido adicional requieren revisión manual.");
  let itadId: string | null;
  if (preview.store === "steam") {
    itadId = (await json<Record<string, string | null>>("https://api.isthereanydeal.com/lookup/id/shop/61/v1", [preview.storeId]))[preview.storeId];
  } else {
    itadId = (await json<Record<string, string | null>>("https://api.isthereanydeal.com/lookup/id/title/v1", [preview.title]))[preview.title];
  }
  if (!itadId) throw Error("No encontramos una identidad exacta en ITAD. Requiere revisión manual.");
  const info = await json<Info>(`https://api.isthereanydeal.com/games/info/v2?id=${encodeURIComponent(itadId)}`);
  if (!sameSuggestionEdition(info.title, preview.title) || !["game", "package"].includes(info.type)) throw Error("La edición de ITAD no coincide exactamente con el enlace propuesto.");
  const pack = info.type === "package" || isPackTitle(info.title);
  const identifiers: GameCandidate["identifiers"] = { itadId };
  let app: SteamApp | undefined;
  if (preview.store === "steam" || info.appid) {
    const steamId = preview.store === "steam" ? preview.storeId : `app/${info.appid}`;
    const [kind, id] = steamId.split("/");
    const details = await json<Record<string, { success?: boolean; data?: SteamApp }>>(`https://store.steampowered.com/api/${kind === "sub" ? "packagedetails?packageids" : "appdetails?appids"}=${id}&cc=AR&l=english`);
    app = details[id]?.data;
    if (!details[id]?.success || !app || !sameSuggestionEdition(app.name, info.title)) throw Error("La ficha Steam no corresponde a la misma edición.");
    if (kind === "app") {
      if (app.type !== "game" || !app.platforms?.windows || app.release_date?.coming_soon) throw Error("No es un juego de PC disponible. Requiere revisión manual.");
      identifiers.steamAppId = Number(id);
    } else {
      if (!pack || (app.apps?.length ?? 0) < 2) throw Error("No se verificó el contenido de la colección.");
      let pcGame = false;
      for (const member of (app.apps ?? []).slice(0, 8)) {
        const data = await json<Record<string, { data?: SteamApp }>>(`https://store.steampowered.com/api/appdetails?appids=${member.id}&cc=AR&l=english`);
        const included = data[String(member.id)]?.data;
        if (included?.type === "game" && included.platforms?.windows) { pcGame = true; break; }
      }
      if (!pcGame) throw Error("No se verificó un juego base de PC dentro del pack.");
      identifiers.steamSubId = Number(id);
    }
  }
  if (preview.store === "microsoft") {
    const products = await json<{ Products?: unknown[] }>(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${preview.storeId}&market=AR&languages=en-us,neutral`);
    if (!hasMicrosoftPcPurchase(products.Products?.[0]) || !findMicrosoftPrice(products.Products?.[0])) throw Error("Microsoft no ofrece precio de compra para PC. No se incorpora la versión de consola.");
    identifiers.microsoftProductId = preview.storeId;
  }
  if (preview.store === "epic") identifiers.epicSlug = preview.storeId;
  if (preview.store === "gog") identifiers.gogSlug = preview.storeId;
  if (preview.store === "humble") identifiers.humbleSlug = preview.storeId;
  const prices = await json<Array<{ id: string; deals?: Array<{ shop: { id: number }; price?: { amount: number }; url?: string }> }>>(
    "https://api.isthereanydeal.com/games/prices/v3?country=AR&shops=61,16,35,37&vouchers=false", [itadId]);
  const expectedStores = [...new Set((prices.find(p => p.id === itadId)?.deals ?? []).filter(d => d.price && d.price.amount >= 0 && d.url && shops[d.shop.id]).map(d => shops[d.shop.id]))];
  if (preview.store === "microsoft") expectedStores.push("microsoft");
  if (!expectedStores.includes(preview.store)) throw Error("La identidad coincide, pero falta precio actual de la tienda propuesta. Requiere revisión.");
  if (pack && expectedStores.length < 2) throw Error("El pack necesita otra tienda comprobada antes de incorporarlo.");
  return { title: info.title, edition: "standard", category: "AA", productKind: pack ? "pack" : "game", confidence: "high",
    primaryTag: pack ? "Packs y colecciones" : app?.genres?.[0]?.description ?? "Sin tag Steam",
    steamTags: app?.genres?.map(g => g.description) ?? info.tags ?? [],
    releaseYear: Number((info.releaseDate ?? app?.release_date?.date ?? "").match(/\b(19|20)\d{2}\b/)?.[0]) || 0,
    coverUrl: app?.header_image ?? info.assets?.banner400 ?? preview.coverUrl,
    isFree: app?.is_free ?? false, identifiers, expectedStores,
    notes: `Propuesta de la comunidad. Identidad ${itadId} y edición verificadas desde ${preview.store}.` };
}

export function suggestionCandidateConflict(candidate: GameCandidate, games: Array<Pick<SampleGame, "id" | "identifiers">>) {
  const identity = candidate.identifiers;
  return games.find(game => identity.itadId && game.identifiers.itadId === identity.itadId
    || identity.steamAppId && game.identifiers.steamAppId === identity.steamAppId
    || identity.steamSubId && game.identifiers.steamSubId === identity.steamSubId);
}
