import { fetchManualPrice } from "./manual";
import { comparableTitle, slugify } from "./utils";
import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";

type EpicOffer = {
  id: string;
  title: string;
  offerType?: string;
  isCodeRedemptionOnly?: boolean;
  productSlug?: string | null;
  urlSlug?: string | null;
  categories?: string[];
  price?: {
    country?: string;
    region?: string;
    price?: {
      currencyCode?: string;
      discountPrice?: number;
      originalPrice?: number;
    };
  } | null;
};

type EpicSearchResponse = {
  total?: number;
  offers?: EpicOffer[];
};

export async function fetchStorePrice(game: SampleGame, region?: RegionConfig): Promise<StorePrice> {
  const manual = await fetchManualPrice(game.title, "epic");
  if (manual) return manual;

  if (!game.identifiers.epicSlug && !game.expectedStores.includes("epic")) {
    return unavailable(game, "Epic no esperado para este candidato", region);
  }

  try {
    const country = region?.epicCountry ?? "AR";
    const response = await fetch(`https://api.egdata.app/search/v2/search?country=${country}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        title: game.title,
        limit: 10,
        offerType: "BASE_GAME"
      }),
      next: { revalidate: 60 * 60 }
    });

    if (!response.ok) {
      return unavailable(game, `Egdata HTTP ${response.status}`, region);
    }

    const data = (await response.json()) as EpicSearchResponse;
    const offer = selectOffer(game, data.offers ?? []);
    if (!offer) return unavailable(game, `Sin match seguro en Egdata ${country}`, region);

    const cents = offer.price?.price;
    if (!cents?.currencyCode || cents.discountPrice == null || cents.originalPrice == null) {
      return {
        store: "epic",
        title: offer.title,
        available: true,
        basePrice: null,
        finalPrice: null,
        currency: cents?.currencyCode ?? null,
        discountPct: null,
        url: epicUrl(offer, region),
        raw: offer,
        error: `Match encontrado, pero sin precio regional ${country}`,
        source: "live"
      };
    }

    const basePrice = cents.originalPrice / 100;
    const finalPrice = cents.discountPrice / 100;
    const discountPct = basePrice > finalPrice ? Math.round((1 - finalPrice / basePrice) * 100) : 0;

    return {
      store: "epic",
      title: offer.title,
      available: true,
      basePrice,
      finalPrice,
      currency: cents.currencyCode,
      discountPct,
      url: epicUrl(offer, region),
      raw: offer,
      source: "live"
    };
  } catch (error) {
    return unavailable(game, error instanceof Error ? error.message : "Error consultando Egdata", region);
  }
}

function selectOffer(game: SampleGame, offers: EpicOffer[]): EpicOffer | null {
  const expectedSlug = game.identifiers.epicSlug ? slugify(game.identifiers.epicSlug) : null;
  const expectedTitle = comparableTitle(game.title);

  const scored = offers
    .filter((offer) => offer.offerType === "BASE_GAME")
    .filter((offer) => !offer.isCodeRedemptionOnly)
    .filter((offer) => offer.categories?.includes("games/edition/base") ?? true)
    .map((offer) => {
      const offerTitle = comparableTitle(offer.title);
      const slugs = [offer.productSlug, offer.urlSlug].filter(Boolean).map((slug) => slugify(String(slug)));
      let score = 0;

      if (offerTitle === expectedTitle) score = 100;
      else if (expectedSlug && slugs.includes(expectedSlug)) score = 95;
      else if (expectedSlug && slugs.some((slug) => slug.includes(expectedSlug) || expectedSlug.includes(slug))) score = 85;
      else if (offerTitle.startsWith(expectedTitle) || expectedTitle.startsWith(offerTitle)) score = 70;

      return { offer, score };
    })
    .filter((entry) => entry.score >= 85)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.offer ?? null;
}

function epicUrl(offer: EpicOffer, region?: RegionConfig): string {
  const slug = offer.productSlug ?? offer.urlSlug;
  const locale = region?.locale ?? "es-AR";
  return slug ? `https://store.epicgames.com/${locale}/p/${slug}` : `https://store.epicgames.com/${locale}/`;
}

function unavailable(game: SampleGame, error: string, region?: RegionConfig): StorePrice {
  const locale = region?.locale ?? "es-AR";
  return {
    store: "epic",
    title: game.title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url: game.identifiers.epicSlug ? `https://store.epicgames.com/${locale}/p/${game.identifiers.epicSlug}` : null,
    raw: null,
    error,
    source: "unavailable"
  };
}
