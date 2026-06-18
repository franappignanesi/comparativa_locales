import { fetchManualPrice } from "./manual";
import { comparableTitle } from "./utils";
import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";

const ALGOLIA_APP_ID = "AYSZEWDAZ2";
const ALGOLIA_SEARCH_KEY = "5229f8b3dec4b8ad265ad17ead42cb7f";
const ALGOLIA_INDEX = "replica_product_query_site_search";

export async function fetchStorePrice(game: SampleGame, _region?: RegionConfig): Promise<StorePrice> {
  const manual = await fetchManualPrice(game.title, "humble");
  if (manual) return manual;

  try {
    const result = await fetchHumbleSearch(game.title);
    const hit = chooseHumbleHit(game.title, result.hits);
    if (!hit) return unavailable(game.title, "Humble Algolia sin match exacto/seguro", null, result);
    const localized = hit.localized_prices?.USD;
    const finalPrice = localized?.current_price ?? hit.price_usd ?? null;
    const basePrice = localized?.full_price ?? finalPrice;

    if (finalPrice == null) {
      return unavailable(game.title, "Humble match sin precio USD", hit.link ? `https://www.humblebundle.com/store${hit.link}` : null, hit);
    }

    return {
      store: "humble",
      title: hit.human_name ?? game.title,
      available: true,
      basePrice,
      finalPrice,
      currency: "USD",
      discountPct: hit.discount ?? calculateDiscount(basePrice, finalPrice),
      url: hit.link ? `https://www.humblebundle.com/store${hit.link}` : null,
      raw: hit,
      source: "live"
    };
  } catch (error) {
    return unavailable(game.title, error instanceof Error ? error.message : "Error desconocido", null, null);
  }
}

type HumbleHit = {
  human_name?: string;
  type?: string;
  link?: string;
  price_usd?: number;
  discount?: number;
  delivery_methods?: string[];
  localized_prices?: Partial<Record<"USD", { current_price: number; full_price: number }>>;
};

async function fetchHumbleSearch(title: string): Promise<{ hits: HumbleHit[] }> {
  const body = JSON.stringify({
    params: new URLSearchParams({
      query: title,
      hitsPerPage: "8",
      filters: "is_live = 1"
    }).toString()
  });
  const response = await fetch(`https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-algolia-api-key": ALGOLIA_SEARCH_KEY,
      "x-algolia-application-id": ALGOLIA_APP_ID
    },
    body,
    next: { revalidate: 3600 }
  });

  if (!response.ok) throw new Error(`Humble Algolia HTTP ${response.status}`);
  return response.json();
}

function chooseHumbleHit(title: string, hits: HumbleHit[]): HumbleHit | null {
  const wanted = comparableTitle(title);
  const storefrontHits = hits.filter((hit) => hit.type === "storefront" && hit.delivery_methods?.length);
  const exact = storefrontHits.find((hit) => comparableTitle(hit.human_name ?? "") === wanted);
  if (exact) return exact;

  return (
    storefrontHits.find((hit) => {
      const found = comparableTitle(hit.human_name ?? "");
      return found === wanted || (found.includes(wanted) && !/\b(deluxe|ultimate|dlc|soundtrack|bundle)\b/i.test(hit.human_name ?? ""));
    }) ?? null
  );
}

function calculateDiscount(basePrice: number | null, finalPrice: number | null): number | null {
  if (!basePrice || finalPrice == null || basePrice <= finalPrice) return 0;
  return Math.round((1 - finalPrice / basePrice) * 100);
}

function unavailable(title: string, error: string, url: string | null, raw: unknown): StorePrice {
  return {
    store: "humble",
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
