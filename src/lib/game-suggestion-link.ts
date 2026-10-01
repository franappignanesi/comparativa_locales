import type { SuggestionLink } from "./game-suggestion-types";

export function parseSuggestionLink(value: unknown): SuggestionLink {
  if (typeof value !== "string" || value.length > 1000) throw Error("Pegá el enlace de la ficha del juego en una tienda oficial.");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw Error("El enlace no es válido."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw Error("Usá un enlace HTTPS de una tienda oficial.");
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if (url.hostname === "store.steampowered.com" && (m = p.match(/^\/(app|sub)\/([1-9]\d{0,9})(?:\/[^/]*)?\/?$/))) {
    return { store: "steam", storeId: `${m[1]}/${m[2]}`, url: `https://store.steampowered.com/${m[1]}/${m[2]}/` };
  }
  if (url.hostname === "store.epicgames.com" && (m = p.match(/^\/[a-z]{2}(?:-[A-Z]{2})?\/p\/([a-z0-9-]+)\/?$/i))) {
    return { store: "epic", storeId: m[1].toLowerCase(), url: `https://store.epicgames.com/es-ES/p/${m[1].toLowerCase()}` };
  }
  if (["www.gog.com", "gog.com"].includes(url.hostname) && (m = p.match(/^\/(?:[a-z]{2}\/)?game\/([a-z0-9_]+)\/?$/i))) {
    return { store: "gog", storeId: m[1].toLowerCase(), url: `https://www.gog.com/en/game/${m[1].toLowerCase()}` };
  }
  if (["www.humblebundle.com", "humblebundle.com", "es.humblebundle.com"].includes(url.hostname) && (m = p.match(/^\/store\/([a-z0-9-]+)\/?$/i))) {
    return { store: "humble", storeId: m[1].toLowerCase(), url: `https://www.humblebundle.com/store/${m[1].toLowerCase()}` };
  }
  if (["www.xbox.com", "xbox.com", "apps.microsoft.com", "www.microsoft.com"].includes(url.hostname) && (m = p.match(/\/([A-Z0-9]{12})\/?$/i))) {
    return { store: "microsoft", storeId: m[1].toUpperCase(), url: `https://apps.microsoft.com/detail/${m[1].toUpperCase()}?hl=en-US&gl=AR` };
  }
  throw Error("Admitimos fichas de Steam, Epic, GOG, Humble y Microsoft. No enlaces acortados ni búsquedas.");
}
