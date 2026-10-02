import { REGIONS, type RegionId } from "./regions";
import { STORES, type HistoricalLow, type LatestPrices, type StoreId } from "./types";
import { STORE_NAMES } from "./seo";

export const MAX_PUBLICATION_IMAGES = 15;
export function publicationGameLimit(includeCover: boolean, includeCta: boolean) {
  return MAX_PUBLICATION_IMAGES - Number(includeCover) - Number(includeCta);
}
export type PublicationPrice = {
  store: StoreId; label: string; amount: number | null; currency: string | null;
  discount: number; historicalLow: boolean; cheapest: boolean; stale: boolean;
};
export type PublicationGame = {
  id: string; title: string; coverUrl: string | null; region: RegionId;
  timestamp: string | null; prices: PublicationPrice[];
};
export type PublicationDraft = { game: PublicationGame; headline: string; description: string; coverPosition?: number };

export function buildPublicationGame(row: LatestPrices["prices"][number], latest: LatestPrices, lows: Partial<Record<StoreId, HistoricalLow>>, region: RegionId, now = Date.now()): PublicationGame {
  const validMoney = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const fresh = (store: StoreId) => {
    const price = row.prices[store];
    const age = now - Date.parse(price?.fetchedAt ?? latest.timestamp ?? "");
    return !price?.isStale && Number.isFinite(age) && age >= -300000 && age <= 48 * 3600000;
  };
  const comparable = STORES.flatMap(store => {
    const price = row.prices[store];
    return price?.available && validMoney(price.originalFinalPrice) && validMoney(price.arsFinalPrice) && fresh(store) ? [price.arsFinalPrice!] : [];
  });
  const cheapest = comparable.length ? Math.min(...comparable) : null;
  const prices = STORES.map(store => {
    const price = row.prices[store];
    const amount = price?.available && validMoney(price.originalFinalPrice) ? price.originalFinalPrice : null;
    const currency = amount != null && /^[A-Z]{3}$/.test(price?.originalCurrency ?? "") ? price!.originalCurrency : null;
    const stale = amount != null && !fresh(store);
    const base = price?.originalBasePrice;
    const reportedDiscount = price?.discountPct;
    const discount = !stale && amount != null && currency != null
      ? typeof reportedDiscount === "number" && Number.isFinite(reportedDiscount) && reportedDiscount >= 0 && reportedDiscount <= 100
        ? Math.floor(reportedDiscount)
        : validMoney(base) && base! > amount ? Math.min(100, Math.floor((1 - amount / base!) * 100 + 0.000001)) : 0
      : 0;
    const low = lows[store];
    const historicalLow = !stale && amount != null && currency != null && low?.originalCurrency === currency &&
      validMoney(low.originalFinalPrice) && amount <= low.originalFinalPrice! + 0.01;
    return { store, label: STORE_NAMES[store], amount: currency ? amount : null, currency, discount, historicalLow,
      cheapest: !stale && currency != null && cheapest != null && price?.arsFinalPrice === cheapest, stale };
  });
  return { id: row.gameId, title: row.gameTitle, coverUrl: row.coverUrl ?? null, region, timestamp: latest.timestamp, prices };
}

export function publicationMoney(price: PublicationPrice): string {
  if (price.amount == null || !price.currency) return "Sin dato";
  return `${price.currency} ${price.amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function publicationCaption(drafts: PublicationDraft[], title: string): string {
  return [title.trim() || "Ofertas para viciar", ...drafts.map(({ game, headline, description }) => {
    const region = REGIONS.find(item => item.id === game.region)!;
    const date = publicationDate(game.timestamp);
    const prices = game.prices.filter(price => price.amount != null).map(price =>
      `${price.label}: ${publicationMoney(price)}${price.discount ? ` (-${price.discount}%)` : ""}${price.historicalLow ? " · mínimo histórico registrado" : ""}`);
    return [`${headline || game.title} · ${region.label}`, description.trim(), ...prices,
      `Precios consultados: ${date}. Sin impuestos agregados por BARATEAM. Confirmá el total en la tienda.`,
      `https://www.shuxteam.com/juegos/${encodeURIComponent(game.id)}`].filter(Boolean).join("\n");
  }), "Compará precios en shuxteam.com · Una herramienta de Shux"].join("\n\n");
}

export function publicationDate(timestamp: string | null): string {
  return timestamp && Number.isFinite(Date.parse(timestamp))
    ? new Date(timestamp).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "Fecha no disponible";
}

export function publicationAssetUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const hosts = ["shared.akamai.steamstatic.com", "shared.fastly.steamstatic.com", "cdn.akamai.steamstatic.com", "cdn.cloudflare.steamstatic.com", "cdn.fastly.steamstatic.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.includes(url.hostname) && /\.(jpg|jpeg|png|webp)$/i.test(url.pathname) ? url : null;
  } catch { return null; }
}
