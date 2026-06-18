import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { appendLatestToHistory } from "../src/lib/history";
import { getDigitalTaxRate, getUsdToArsRate, normalizePrice } from "../src/lib/normalize";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, StorePrice } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SteamSpyGame = {
  appid: number;
  name: string;
  price?: string;
  initialprice?: string;
  discount?: string;
  owners?: string;
  positive?: number;
  negative?: number;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const pages = parsePositiveInt(process.env.STEAMSPY_PAGES) ?? 4;
  const sample = await getGameSample();
  const latest = await readJson<LatestPrices>(dataPath("generated", "latest-prices.json"), emptyLatest());
  const exchangeRate = await getUsdToArsRate();
  const steamSpyByAppId = await fetchSteamSpyPages(pages);
  const rowsById = new Map(latest.prices.map((row) => [row.gameId, row]));
  let backfilled = 0;

  for (const game of sample.broadSample) {
    const appId = game.identifiers.steamAppId;
    if (!appId) continue;
    const row = rowsById.get(game.id);
    if (!row) continue;
    const currentSteam = row.prices.steam;
    if (currentSteam?.available && currentSteam.arsFinalPrice != null) continue;
    const steamSpy = steamSpyByAppId.get(appId);
    if (!steamSpy) continue;
    const price = toSteamSpyStorePrice(game.title, appId, steamSpy);
    if (!price.available) continue;
    row.prices.steam = normalizePrice(price, exchangeRate.usdToArs);
    backfilled += 1;
  }

  const refreshedIds = new Set(
    sample.broadSample
      .filter((game) => game.identifiers.steamAppId && rowsById.get(game.id)?.prices.steam?.source === "steamspy")
      .map((game) => game.id)
  );
  const updated: LatestPrices = {
    ...latest,
    timestamp: new Date().toISOString(),
    usdToArs: exchangeRate.usdToArs,
    usdToArsSource: exchangeRate.source,
    usdToArsTimestamp: exchangeRate.timestamp,
    digitalVatRate: getDigitalTaxRate("AR"),
    prices: sample.broadSample.map((game) => rowsById.get(game.id)).filter((row): row is LatestPrices["prices"][number] => Boolean(row)),
    errors: latest.errors.filter((error) => !(error.store === "steam" && refreshedIds.has(error.gameId)))
  };

  await writeJson(dataPath("generated", "latest-prices.json"), updated);
  await appendLatestToHistory({
    ...updated,
    prices: updated.prices.filter((row) => refreshedIds.has(row.gameId)),
    errors: []
  });

  console.log(
    JSON.stringify(
      {
        pages,
        backfilled,
        rows: updated.prices.length,
        steamCoverage: updated.prices.filter((row) => row.prices.steam?.available && row.prices.steam.arsFinalPrice != null).length,
        errors: updated.errors.length,
        usdToArs: updated.usdToArs,
        usdToArsSource: updated.usdToArsSource
      },
      null,
      2
    )
  );
}

async function fetchSteamSpyPages(pages: number): Promise<Map<number, SteamSpyGame>> {
  const games = new Map<number, SteamSpyGame>();
  for (let page = 0; page < pages; page += 1) {
    const response = await fetch(`https://steamspy.com/api.php?request=all&page=${page}`);
    if (!response.ok) throw new Error(`SteamSpy page ${page} failed: ${response.status}`);
    const data = (await response.json()) as Record<string, SteamSpyGame>;
    for (const game of Object.values(data)) games.set(game.appid, game);
  }
  return games;
}

function toSteamSpyStorePrice(title: string, appId: number, game: SteamSpyGame): StorePrice {
  const finalPrice = centsToUsd(game.price);
  const basePrice = centsToUsd(game.initialprice) ?? finalPrice;
  const discountPct = parseDiscount(game.discount, basePrice, finalPrice);
  if (finalPrice == null || finalPrice <= 0) {
    return unavailable(title, appId, "SteamSpy sin precio pago");
  }
  return {
    store: "steam",
    title: game.name || title,
    available: true,
    basePrice,
    finalPrice,
    currency: "USD",
    discountPct,
    url: `https://store.steampowered.com/app/${appId}`,
    raw: {
      source: "steamspy",
      appid: game.appid,
      owners: game.owners,
      positive: game.positive,
      negative: game.negative,
      price: game.price,
      initialprice: game.initialprice,
      discount: game.discount
    },
    source: "steamspy"
  };
}

function unavailable(title: string, appId: number, error: string): StorePrice {
  return {
    store: "steam",
    title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url: `https://store.steampowered.com/app/${appId}`,
    raw: null,
    error,
    source: "unavailable"
  };
}

function centsToUsd(value: string | undefined): number | null {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return Math.round(cents) / 100;
}

function parseDiscount(value: string | undefined, basePrice: number | null, finalPrice: number | null): number | null {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  if (basePrice != null && finalPrice != null && basePrice > finalPrice) return Math.round((1 - finalPrice / basePrice) * 100);
  return 0;
}

function emptyLatest(): LatestPrices {
  return {
    timestamp: null,
    usdToArs: 0,
    prices: [],
    errors: []
  };
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
