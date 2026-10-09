import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { getGameSample } from "@/lib/sample-builder";
import { getLatestPrices } from "@/lib/prices";
import { getWeekendGames } from "@/lib/weekend-games";
import { AUTUMN_OFFERS_ENABLED, AUTUMN_PATH } from "@/lib/autumn-offers";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sample, latest] = await Promise.all([getGameSample(), getLatestPrices({ refresh: false, useCachedExchangeRate: true })]);
  const timestamp = latest.timestamp ?? sample.timestamp;
  const lastModified = timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp) : undefined;
  const priced = new Set(latest.prices.filter((row) => Object.values(row.prices).some((price) => price?.available && price.finalPrice != null && Number.isFinite(price.finalPrice) && price.finalPrice >= 0 && price.url)).map((row) => row.gameId));
  const reviewed = new Set(getWeekendGames().map((game) => game.steamAppId));
  return [
    ...["/privacidad", "/terminos"].map((path) => ({ url: `${SITE_URL}${path}`, lastModified: new Date("2026-10-01T00:00:00Z") })),
    ...["/", "/biblioteca", "/comparativa-general", "/biblioteca/juego-del-finde", ...(AUTUMN_OFFERS_ENABLED ? [AUTUMN_PATH] : []), "/juegos"].map((path) => ({ url: `${SITE_URL}${path}`, lastModified })),
    ...Array.from({ length: Math.max(0, Math.ceil(sample.broadSample.length / 100) - 1) }, (_, index) => ({ url: `${SITE_URL}/juegos/pagina/${index + 2}`, lastModified })),
    ...sample.broadSample.filter((game) => priced.has(game.id) || game.isFree || reviewed.has(game.identifiers.steamAppId!)).map((game) => ({ url: `${SITE_URL}/juegos/${game.id}`, lastModified }))
  ];
}
