import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";
import { numberFromPrice } from "./utils";

const MICROSOFT_SEARCH_VERSION = "22203.1401.0.0";

export async function fetchStorePrice(game: SampleGame, region?: RegionConfig): Promise<StorePrice> {
  const productId =
    game.identifiers.microsoftProductId ??
    extractProductId(game.identifiers.microsoftUrl ?? null) ??
    (await searchMicrosoftProductId(game, region));
  if (productId) {
    return fetchDisplayCatalogPrice(game, productId, region);
  }

  const url = game.identifiers.microsoftUrl;
  if (!url) {
    return unavailable(game.title, "Sin microsoftProductId ni microsoftUrl");
  }

  try {
    const response = await fetch(url, {
      headers: { "accept-language": `${region?.locale ?? "es-AR"},es;q=0.9,en;q=0.5` },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return unavailable(game.title, `Microsoft HTTP ${response.status}`, url);
    const html = await response.text();
    const price = extractArsPrice(html);

    if (price == null) {
      return unavailable(game.title, "No se pudo extraer precio ARS del HTML", url, html.slice(0, 1000));
    }

    return {
      store: "microsoft",
      title: game.title,
      available: true,
      basePrice: price,
      finalPrice: price,
      currency: "ARS",
      discountPct: null,
      url,
      raw: { extractedPrice: price },
      source: "live"
    };
  } catch (error) {
    return unavailable(game.title, error instanceof Error ? error.message : "Error desconocido", url);
  }
}

async function searchMicrosoftProductId(game: SampleGame, region?: RegionConfig): Promise<string | null> {
  if (!game.expectedStores.includes("microsoft")) return null;
  const url = new URL("https://storeedgefd.dsx.mp.microsoft.com/v9.0/pages/searchResults");
  url.searchParams.set("appVersion", MICROSOFT_SEARCH_VERSION);
  url.searchParams.set("market", region?.microsoftMarket ?? "AR");
  url.searchParams.set("locale", region?.locale ?? "es-AR");
  url.searchParams.set("deviceFamily", "windows.desktop");
  url.searchParams.set("mediaType", "games");
  url.searchParams.set("query", game.title);

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const json = await response.json();
    const results = collectSearchResults(json);
    return selectMicrosoftSearchResult(game, results)?.ProductId ?? null;
  } catch {
    return null;
  }
}

async function fetchDisplayCatalogPrice(game: SampleGame, productId: string, region?: RegionConfig): Promise<StorePrice> {
  const market = region?.microsoftMarket ?? "AR";
  const locale = (region?.locale ?? "es-AR").toLowerCase();
  const url = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${productId}&market=${market}&languages=${locale},neutral&MS-CV=DGU1mcuYo0WMMp+F.1`;

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return unavailable(game.title, `Microsoft catalog HTTP ${response.status}`, url);
    const json = await response.json();
    const product = json?.Products?.[0];
    const title = product?.LocalizedProperties?.[0]?.ProductTitle ?? game.title;
    const price = findMicrosoftPrice(product);

    if (!price) return unavailable(title, `Microsoft catalog sin precio de compra para ${market}`, url, product);
    if (!isMicrosoftTitleCompatible(game.title, title)) {
      return unavailable(game.title, `Microsoft catalog devolvio "${title}" para "${game.title}"`, url, { productId, title });
    }

    return {
      store: "microsoft",
      title,
      available: true,
      basePrice: price.basePrice,
      finalPrice: price.finalPrice,
      currency: price.currency,
      discountPct: calculateDiscount(price.basePrice, price.finalPrice),
      url: buildXboxStoreUrl(title, productId, region),
      raw: product,
      source: "live"
    };
  } catch (error) {
    return unavailable(game.title, error instanceof Error ? error.message : "Error desconocido", url);
  }
}

function findMicrosoftPrice(product: unknown): { basePrice: number; finalPrice: number; currency: string } | null {
  const candidates = collectAvailabilities(product)
    .filter((availability) => {
      const actions = availability?.Actions;
      return Array.isArray(actions) && actions.includes("Purchase") && isAvailabilityActive(availability);
    })
    .map((availability) => availability?.OrderManagementData?.Price)
    .filter(Boolean);

  const priced = candidates
    .map((price) => ({
      currency: String(price.CurrencyCode ?? "ARS"),
      finalPrice: numberFromPrice(price.ListPrice),
      basePrice: numberFromPrice(price.MSRP)
    }))
    .filter((price) => price.finalPrice != null && price.finalPrice > 0);

  if (!priced.length) return null;
  const cheapest = priced.sort((a, b) => (a.finalPrice ?? 0) - (b.finalPrice ?? 0))[0];
  return {
    currency: cheapest.currency,
    finalPrice: cheapest.finalPrice ?? 0,
    basePrice: cheapest.basePrice && cheapest.basePrice > 0 ? cheapest.basePrice : cheapest.finalPrice ?? 0
  };
}

function collectAvailabilities(node: unknown): Array<Record<string, any>> {
  if (!node || typeof node !== "object") return [];
  const object = node as Record<string, any>;
  const here = Array.isArray(object.Availabilities) ? object.Availabilities : [];
  const nested = Object.entries(object).flatMap(([key, value]) =>
    key === "HistoricalBestAvailabilities" || typeof value !== "object" ? [] : collectAvailabilities(value)
  );
  return [...here, ...nested];
}

function isAvailabilityActive(availability: Record<string, any>): boolean {
  const now = Date.now();
  const start = parseMicrosoftDate(
    availability?.Conditions?.StartDate ??
      availability?.Properties?.OriginalReleaseDate ??
      availability?.OrderManagementData?.Price?.StartDate
  );
  const end = parseMicrosoftDate(
    availability?.Conditions?.EndDate ??
      availability?.Properties?.EndDate ??
      availability?.OrderManagementData?.Price?.EndDate
  );
  if (start != null && start > now) return false;
  if (end != null && end < now) return false;
  return true;
}

function parseMicrosoftDate(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateDiscount(basePrice: number | null, finalPrice: number | null): number {
  if (!basePrice || finalPrice == null || basePrice <= finalPrice) return 0;
  return Math.round((1 - finalPrice / basePrice) * 100);
}

function buildXboxStoreUrl(title: string, productId: string, region?: RegionConfig): string {
  return `https://www.xbox.com/${region?.locale ?? "es-AR"}/games/store/${slugifyXboxTitle(title)}/${productId}`;
}

function slugifyXboxTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

type MicrosoftSearchResult = {
  ProductId?: string;
  Title?: string;
  CardActions?: string[];
  Price?: number;
  ProductFamilyName?: string;
};

function collectSearchResults(node: unknown): MicrosoftSearchResult[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectSearchResults);
  const object = node as Record<string, unknown>;
  const payload = object.Payload as Record<string, unknown> | undefined;
  const direct = payload?.SearchResults;
  const nested = Object.values(object).flatMap((value) => collectSearchResults(value));
  return Array.isArray(direct) ? [...(direct as MicrosoftSearchResult[]), ...nested] : nested;
}

function selectMicrosoftSearchResult(game: SampleGame, results: MicrosoftSearchResult[]): MicrosoftSearchResult | null {
  const expected = cleanMicrosoftTitle(game.title);
  const scored = results
    .filter((result) => result.ProductId && result.Title)
    .filter((result) => result.ProductFamilyName == null || result.ProductFamilyName === "Games")
    .filter((result) => Array.isArray(result.CardActions) && result.CardActions.includes("Purchase"))
    .map((result) => {
      const title = cleanMicrosoftTitle(result.Title ?? "");
      let score = 0;
      if (title === expected) score = 100;
      else if (title.replace(/\sfor windows$/, "") === expected) score = 95;
      else if (title.startsWith(expected) && !hasEditionMismatch(game.title, result.Title ?? "")) score = 80;
      return { result, score };
    })
    .filter((entry) => entry.score >= 95)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.result ?? null;
}

function isMicrosoftTitleCompatible(candidateTitle: string, resultTitle: string): boolean {
  const expected = cleanMicrosoftTitle(candidateTitle);
  const title = cleanMicrosoftTitle(resultTitle);
  if (title === expected) return true;
  if (title.replace(/\sfor windows$/, "") === expected) return true;
  return title.startsWith(expected) && !hasEditionMismatch(candidateTitle, resultTitle);
}

function cleanMicrosoftTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(the|edition|standard|pc|game)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(windows|xbox|one|series|xs)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEditionMismatch(candidateTitle: string, resultTitle: string): boolean {
  const candidate = candidateTitle.toLowerCase();
  const result = resultTitle.toLowerCase();
  const editionWords = ["deluxe", "ultimate", "gold", "bundle", "pack", "trilogy", "collection"];
  return editionWords.some((word) => result.includes(word) && !candidate.includes(word));
}

function extractProductId(url: string | null): string | null {
  if (!url) return null;
  const matches = url.toUpperCase().match(/[A-Z0-9]{12,}/g);
  return matches?.find((match) => match.startsWith("9") || match.startsWith("C") || match.startsWith("B")) ?? null;
}

function extractArsPrice(html: string): number | null {
  const patterns = [
    /\$\s?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)/,
    /ARS\s?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function unavailable(title: string, error: string, url: string | null = null, raw: unknown = null): StorePrice {
  return {
    store: "microsoft",
    title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url,
    raw,
    error,
    source: "unavailable"
  };
}
