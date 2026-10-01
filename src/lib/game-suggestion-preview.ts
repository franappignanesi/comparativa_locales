import { load } from "cheerio";
import { getGameSample } from "./sample-builder";
import { parseSuggestionLink } from "./game-suggestion-link";
import type { SuggestionLink, SuggestionPreview } from "./game-suggestion-types";

async function boundedFetch(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok || !response.body) throw Error("La tienda no respondió.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) throw Error("La respuesta de la tienda es demasiado grande.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}

export function existingSuggestionGame(link: SuggestionLink, games: Awaited<ReturnType<typeof getGameSample>>["broadSample"]) {
  return games.find(game => {
    const id = game.identifiers;
    if (link.store === "steam") return link.storeId === `app/${id.steamAppId}` || link.storeId === `sub/${id.steamSubId}`;
    if (link.store === "epic") return id.epicSlug === link.storeId;
    if (link.store === "gog") return id.gogSlug === link.storeId;
    if (link.store === "humble") return id.humbleSlug === link.storeId;
    return id.microsoftProductId === link.storeId || id.microsoftUrl?.toUpperCase().includes(`/${link.storeId}`);
  });
}

export async function resolveSuggestionPreview(value: unknown): Promise<SuggestionPreview> {
  const link = parseSuggestionLink(value);
  const sample = await getGameSample();
  const existing = existingSuggestionGame(link, sample.broadSample);
  if (existing) return { ...link, title: existing.title, coverUrl: existing.coverUrl ?? null, existingGameId: existing.id };
  let title: string | null = null;
  let coverUrl: string | null = null;
  try {
    if (link.store === "steam") {
      const [kind, id] = link.storeId.split("/");
      const data = JSON.parse(await boundedFetch(`https://store.steampowered.com/api/${kind === "app" ? "appdetails?appids" : "packagedetails?packageids"}=${id}&cc=AR&l=english`))[id]?.data;
      title = typeof data?.name === "string" ? data.name : null;
      coverUrl = data?.header_image ?? null;
    } else if (link.store === "microsoft") {
      const data = JSON.parse(await boundedFetch(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${link.storeId}&market=AR&languages=en-us,neutral`)).Products?.[0];
      title = data?.LocalizedProperties?.[0]?.ProductTitle ?? null;
    } else {
      const $ = load(await boundedFetch(link.url));
      title = $("meta[property='og:title']").attr("content") ?? $("title").text() ?? null;
      title = title?.replace(/\s+(?:on GOG\.COM|\| Download and Buy Today).*$/i, "").replace(/\s*[-|]\s*(?:GOG\.COM|Humble Store|Epic Games Store).*$/i, "").replace(/^Buy\s+/i, "").trim() || null;
      coverUrl = $("meta[property='og:image']").attr("content") ?? null;
    }
  } catch { /* A failed preview must not prevent saving the suggestion for review. */ }
  if (coverUrl && !/^https:\/\//.test(coverUrl)) coverUrl = null;
  return { ...link, title: title?.slice(0, 200) ?? null, coverUrl: coverUrl?.slice(0, 1000) ?? null, existingGameId: null };
}
