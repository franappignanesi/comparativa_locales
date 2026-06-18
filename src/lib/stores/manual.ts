import { dataPath, readJson } from "../cache";
import type { ManualPricesFile, StoreId, StorePrice } from "../types";

const emptyManualPrices: ManualPricesFile = {
  updatedAt: null,
  prices: []
};

export async function fetchManualPrice(gameTitle: string, store: StoreId): Promise<StorePrice | null> {
  const file = await readJson<ManualPricesFile>(dataPath("manual-prices.json"), emptyManualPrices);
  const entry = file.prices.find(
    (price) => price.store === store && price.gameTitle.toLowerCase() === gameTitle.toLowerCase()
  );

  if (!entry) return null;

  return {
    store,
    title: entry.title ?? gameTitle,
    available: entry.available,
    basePrice: entry.basePrice,
    finalPrice: entry.finalPrice,
    currency: entry.currency,
    discountPct: entry.discountPct ?? null,
    url: entry.url ?? null,
    raw: entry,
    source: "manual"
  };
}
