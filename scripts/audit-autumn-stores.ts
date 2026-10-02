import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import selection from "../data/autumn-selection.json";
import { steamIdentity } from "../src/lib/autumn-offers";
import { normalizedCatalogTitle } from "../src/lib/catalog-expansion";
import { parseSuggestionLink } from "../src/lib/game-suggestion-link";
import { discoverMicrosoftProduct, hasMicrosoftPcPurchase, findMicrosoftPrice, selectMicrosoftSearchResult } from "../src/lib/stores/microsoft";
import { REGIONS } from "../src/lib/regions";
import type { GameSample } from "../src/lib/types";

loadEnvConfig(process.cwd());
const deadline = Date.now() + 8 * 60_000;
async function json(url: string, body?: unknown) {
  if (Date.now() > deadline) throw Error("Audit deadline reached");
  const response = await fetch(url, { method: body ? "POST" : "GET", signal: AbortSignal.timeout(12000), headers: {
    accept: "application/json", ...(body ? { "content-type": "application/json" } : {}),
    ...(new URL(url).hostname === "api.isthereanydeal.com" ? { "ITAD-API-Key": process.env.ITAD_API_KEY! } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`Upstream HTTP ${response.status}`);
  return response.json();
}
async function main() {
  if (!process.env.ITAD_API_KEY) throw Error("ITAD key required");
  const sample: GameSample = await json("https://www.shuxteam.com/api/sample");
  const selected = selection.map(item => ({ item, game: sample.broadSample.find(game => steamIdentity(game.identifiers) === steamIdentity(item)) }));
  if (selected.some(row => !row.game)) throw Error("A selection identity is missing from the live catalog");
  const apps = selected.filter(row => row.item.steamAppId);
  const ids: Record<string, string | null> = await json("https://api.isthereanydeal.com/lookup/id/shop/61/v1", apps.map(row => `app/${row.item.steamAppId}`));
  // Collection contents were compared against the official Steam/Epic listings.
  const collectionIds: Record<string, string | null> = await json("https://api.isthereanydeal.com/lookup/id/title/v1", ["Destiny 2: The Collection"]);
  const reports: Array<Record<string, unknown>> = [];
  const verifiedIds = new Set<string>();
  const storeIds: Record<number, string> = {};
  const shopNames: Record<string, string[]> = { epic: ["Epic Game Store", "Epic Games Store"], gog: ["GOG"], humble: ["Humble Store", "Humble Bundle"] };
  const shops = await json("https://api.isthereanydeal.com/service/shops/v1?country=AR");
  for (const shop of shops) {
    const store = Object.keys(shopNames).find(store => shopNames[store].includes(shop.name ?? shop.title));
    if (store) storeIds[shop.id] = store;
  }
  if (Object.keys(storeIds).length !== 3) throw Error("Cannot resolve all official shop identities");
  for (const { item, game } of selected) {
    const verifiedCollection = item.steamBundleId === 72233;
    const id = item.steamAppId ? ids[`app/${item.steamAppId}`] : verifiedCollection ? collectionIds["Destiny 2: The Collection"] : null;
    const row: Record<string, unknown> = { title: item.title, gameId: game!.id, steam: steamIdentity(item), identifiers: game!.identifiers,
      itadId: id, identityVerified: false, stores: {}, microsoft: { status: "unverified" } };
    reports.push(row);
    if (!item.steamAppId && !verifiedCollection) { row.note = "Steam-specific bundle: do not substitute individual games or another collection without comparing all contents."; continue; }
    if (id) {
      const info = await json(`https://api.isthereanydeal.com/games/info/v2?id=${encodeURIComponent(id)}`);
      const exact = (item.steamAppId && info.appid === item.steamAppId) || normalizedCatalogTitle(info.title) === normalizedCatalogTitle(game!.title);
      row.itadTitle = info.title; row.itadType = info.type; row.identityVerified = Boolean(exact) && (verifiedCollection || info.type === "game");
      if (row.identityVerified) verifiedIds.add(id);
    }
    if (verifiedCollection) continue;
    try {
      const existing = game!.identifiers.microsoftProductId;
      const productId = existing ?? await discoverMicrosoftProduct(game!, REGIONS[0]);
      if (!productId) { row.microsoft = { status: "no-verified-pc-match" }; }
      else {
        const product = (await json(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${productId}&market=AR&languages=en-us,neutral`)).Products?.[0];
        const title = product?.LocalizedProperties?.[0]?.ProductTitle;
        const pc = hasMicrosoftPcPurchase(product);
        const price = findMicrosoftPrice(product);
        const match = selectMicrosoftSearchResult(game!, [{ ProductId: productId, Title: title, CardActions: pc ? ["Purchase"] : [] }]);
        row.microsoft = { status: pc && price && match ? "verified" : "not-a-matching-pc-purchase", productId, title, pc, price };
      }
    } catch (error) { row.microsoft = { status: "upstream-error", error: error instanceof Error ? error.message : "Unknown error" }; }
    console.log(JSON.stringify({ title: item.title, identityVerified: row.identityVerified, microsoft: row.microsoft }));
  }
  for (const region of REGIONS) {
    const prices = await json(`https://api.isthereanydeal.com/games/prices/v3?country=${region.id}&shops=${Object.keys(storeIds).join(",")}&vouchers=false`, [...verifiedIds]);
    for (const row of reports.filter(row => row.identityVerified)) {
      const stores = row.stores as Record<string, unknown>;
      const offers = prices.find((price: { id: string }) => price.id === row.itadId)?.deals ?? [];
      stores[region.id] = offers.flatMap((offer: { shop: { id: number }; price?: { amount: number; currency: string }; url?: string }) => {
        const store = storeIds[offer.shop.id];
        if (!store || !offer.url || !offer.price || offer.price.amount <= 0) return [];
        try {
          const link = parseSuggestionLink(offer.url);
          if (store !== link.store) return [];
          return [{ store: link.store, identifier: link.storeId, url: link.url, price: offer.price }];
        } catch { return [{ store, identifier: null, url: offer.url, price: offer.price, needsCanonicalLink: true }]; }
      });
    }
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/autumn-store-audit.json", JSON.stringify({ checkedAt: new Date().toISOString(),
    notes: "No verified deal is not proof of absence. Microsoft matches require a matching PC purchase; console products are rejected. No catalog files modified.", storeIds, games: reports }, null, 2));
  console.log(JSON.stringify({ audited: reports.length, verifiedItad: verifiedIds.size, report: "artifacts/autumn-store-audit.json" }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; });
