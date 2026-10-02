import { load } from "cheerio";
import type { RegionConfig } from "../regions";
import type { SampleGame, StorePrice } from "../types";

export function parseSteamBundle(game: SampleGame, html: string, region?: RegionConfig): StorePrice {
  const id = game.identifiers.steamBundleId;
  const $ = load(html);
  const purchase = $(`.game_area_purchase_game[data-ds-bundleid="${id}"][data-ds-bundle-data]`).first();
  const block = purchase.find(".game_purchase_discount").first();
  const items = JSON.parse(purchase.attr("data-ds-bundle-data") ?? "{}").m_rgItems as Array<{ m_nBasePriceInCents: number }> | undefined;
  const final = Number(block.attr("data-price-final"));
  const base = items?.reduce((sum, item) => sum + item.m_nBasePriceInCents, 0);
  if (!block.length || !Number.isFinite(final) || final <= 0 || !base || !Number.isFinite(base) || base < final) throw new Error("Sin precio verificable del bundle completo de Steam");
  const currency = ({ AR: "USD", MX: "MXN", ES: "EUR", PE: "PEN", CL: "CLP" } as const)[region?.id ?? "AR"];
  return { store: "steam", title: game.title, available: true, basePrice: base / 100, finalPrice: final / 100,
    currency, discountPct: Math.round((1 - final / base) * 100), url: `https://store.steampowered.com/bundle/${id}/`,
    raw: null, source: "live", fetchedAt: new Date().toISOString() };
}
