import { fetchManualPrice } from "./manual";
import { numberFromPrice, storeSlug } from "./utils";
import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";

export async function fetchStorePrice(game: SampleGame, region?: RegionConfig): Promise<StorePrice> {
  const manual = await fetchManualPrice(game.title, "gog");
  if (manual) return manual;
  const slug = storeSlug(game, game.identifiers.gogSlug);
  const currency = region?.currency === "ARS" ? "USD" : region?.currency ?? "USD";
  const country = region?.id ?? "AR";
  const url = `https://www.gog.com/en/game/${slug}?currencyCode=${currency}&countryCode=${country}`;

  try {
    const response = await fetch(url, {
      headers: { "accept-language": "en-US,en;q=0.8" },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return unavailable(game.title, `GOG HTTP ${response.status}`, url);
    const html = await response.text();
    const price = extractGogPrice(html);

    if (!price) return unavailable(game.title, "No se pudo extraer price de window.productcardData", url);

    return {
      store: "gog",
      title: price.title ?? game.title,
      available: true,
      basePrice: price.basePrice,
      finalPrice: price.finalPrice,
      currency: price.currency,
      discountPct: price.discountPct,
      url,
      raw: price.raw,
      source: "live"
    };
  } catch (error) {
    return unavailable(game.title, error instanceof Error ? error.message : "Error desconocido", url);
  }
}

function extractGogPrice(html: string): {
  title: string | null;
  basePrice: number | null;
  finalPrice: number | null;
  discountPct: number | null;
  currency: string;
  raw: Record<string, unknown>;
} | null {
  const cardMatch = html.match(/cardProduct:\s*(\{[\s\S]*?\}),\s*cardProductId:/);
  const card = cardMatch?.[1] ?? html;
  const finalPrice = numberFromPrice(card.match(/"finalAmount"\s*:\s*"([^"]+)"/)?.[1]);
  const basePrice = numberFromPrice(card.match(/"baseAmount"\s*:\s*"([^"]+)"/)?.[1]);
  const discountPct = numberFromPrice(card.match(/"discountPercentage"\s*:\s*"([^"]+)"/)?.[1]);
  const title = card.match(/"title"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const currency = html.match(/currency:\s*"([^"]+)"/)?.[1] ?? "USD";

  if (finalPrice == null) return null;

  return {
    title,
    basePrice: basePrice ?? finalPrice,
    finalPrice,
    discountPct,
    currency,
    raw: { finalPrice, basePrice, discountPct, currency }
  };
}

function unavailable(title: string, error: string, url: string | null): StorePrice {
  return {
    store: "gog",
    title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url,
    raw: null,
    error,
    source: "unavailable"
  };
}
