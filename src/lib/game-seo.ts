import { cache } from "react";
import { getGameSample } from "./sample-builder";
import { getLatestPrices } from "./prices";
import { getWeekendGames } from "./weekend-games";
import { SITE_URL, STORE_NAMES } from "./seo";
import { STORES } from "./types";
import type { NormalizedPrice } from "./types";

export function nativeOfferPrice(price: NormalizedPrice): NormalizedPrice {
  return { ...price, currency: price.originalCurrency ?? price.currency, finalPrice: price.originalFinalPrice ?? price.finalPrice };
}

export const getGameSeoData = cache(async (slug: string) => {
  const sample = await getGameSample();
  const game = sample.broadSample.find((item) => item.id === slug);
  if (!game) return null;
  const latest = await getLatestPrices({ refresh: false, useCachedExchangeRate: true });
  const row = latest.prices.find((item) => item.gameId === slug);
  const offers = STORES.flatMap((store) => {
    const source = row?.prices[store];
    const price = source ? nativeOfferPrice(source) : undefined;
    return price?.available && price.finalPrice != null && Number.isFinite(price.finalPrice) && price.finalPrice >= 0 && price.currency && price.url ? [{ store, price }] : [];
  });
  return { game, offers, timestamp: latest.timestamp,
    weekend: getWeekendGames().find((item) => item.steamAppId === game.identifiers.steamAppId),
    related: sample.broadSample.filter((item) => item.id !== slug && (game.primaryTag ? item.primaryTag === game.primaryTag : item.category === game.category)).slice(0, 8) };
});

export function gameStructuredData(data: NonNullable<Awaited<ReturnType<typeof getGameSeoData>>>) {
  return { "@context": "https://schema.org", "@type": "VideoGame", name: data.game.title,
    url: `${SITE_URL}/juegos/${data.game.id}`, image: data.game.coverUrl ?? undefined, gamePlatform: "PC",
    offers: data.offers.filter(({ price }) => !price.isStale).map(({ store, price }) => ({ "@type": "Offer", price: price.finalPrice,
      priceCurrency: price.currency, url: price.url, seller: { "@type": "Organization", name: STORE_NAMES[store] } })) };
}
