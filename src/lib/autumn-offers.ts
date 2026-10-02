import selection from "../../data/autumn-selection.json";
import type { HistoricalLow, LatestPrices, SampleGame, StoreIdentifiers } from "./types";

export const AUTUMN_FILTER = "otono";
export const AUTUMN_PATH = "/ofertas-de-otono";
export const AUTUMN_SELECTION = selection;
type Row = LatestPrices["prices"][number];

export function steamIdentity(ids: StoreIdentifiers): string {
  if (ids.steamBundleId) return `bundle/${ids.steamBundleId}`;
  if (ids.steamSubId) return `sub/${ids.steamSubId}`;
  return ids.steamAppId ? `app/${ids.steamAppId}` : "";
}

export function steamOfferDiscount(row: Row): number {
  const price = row.prices.steam;
  if (!price?.available || price.isStale || price.originalFinalPrice == null || price.originalFinalPrice <= 0) return 0;
  const base = price.originalBasePrice;
  return Math.max(0, Math.min(100, Math.round(base && base > price.originalFinalPrice ? (1 - price.originalFinalPrice / base) * 100 : price.discountPct ?? 0)));
}

export function steamAtHistoricalLow(row: Row, low: HistoricalLow | undefined): boolean {
  const price = row.prices.steam;
  // Compare native currency, not historical conversions at different exchange rates.
  return Boolean(price?.available && low && price.originalCurrency === low.originalCurrency &&
    price.originalFinalPrice != null && low.originalFinalPrice != null && low.originalFinalPrice > 0 &&
    price.originalFinalPrice <= low.originalFinalPrice + 0.01);
}

export function steamOfferScore(row: Row, game: SampleGame | undefined, low: HistoricalLow | undefined): number {
  const reviews = Number(game?.notes.match(/(?:reviews|reseñas):\s*([\d,]+)/i)?.[1]?.replace(/,/g, "")) || 0;
  const rank = Number(game?.notes.match(/puesto\s+(\d+)/i)?.[1]) || 0;
  const editorial = AUTUMN_SELECTION.some(item => steamIdentity(item) === steamIdentity(game?.identifiers ?? {}));
  const relevance = Math.max(Math.min(70, Math.log10(1 + reviews) * 12), rank ? Math.max(0, 65 - rank * 0.3) : 0, editorial ? 55 : 0);
  return relevance + (steamAtHistoricalLow(row, low) ? 30 : 0) + steamOfferDiscount(row) * 0.05;
}
