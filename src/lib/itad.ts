import { getExchangeRate, normalizePrice } from "./normalize";
import type { ExchangeRate } from "./normalize";
import { DEFAULT_REGION, REGIONS, type RegionId } from "./regions";
import type { RegionConfig } from "./regions";
import type { LatestPrices, NormalizedPrice, PriceHistoryEntry, SampleGame, StoreId, StorePrice } from "./types";
import { STORES } from "./types";

type ItadPrice = {
  amount?: number;
  amountInt?: number;
  currency?: string;
};

type ItadShop = {
  id: number;
  name?: string;
  title?: string;
};

type ItadStoreLow = {
  id: string;
  lows?: Array<{
    shop?: ItadShop;
    price?: ItadPrice;
    regular?: ItadPrice;
    cut?: number;
    timestamp?: string;
    url?: string;
  }>;
};

type ItadHistoryLogEntry = {
  timestamp?: string;
  shop?: ItadShop;
  deal?: {
    price?: ItadPrice;
    regular?: ItadPrice;
    cut?: number;
    url?: string;
  };
};

type ItadLookup = Record<string, string | null>;

type ItadCurrentPriceEntry = {
  id: string;
  deals?: Array<{
    shop?: ItadShop;
    price?: ItadPrice;
    regular?: ItadPrice;
    cut?: number;
    timestamp?: string;
    url?: string;
  }>;
};

type ItadHistoryFile = {
  timestamp: string | null;
  enabled: boolean;
  source: string;
  matchedGames: number;
  errors: string[];
  entries: PriceHistoryEntry[];
};

const ITAD_API = "https://api.isthereanydeal.com";
const ITAD_STORE_NAMES: Record<StoreId, string[]> = {
  steam: ["Steam"],
  epic: ["Epic Game Store", "Epic Games Store"],
  gog: ["GOG"],
  humble: ["Humble Store", "Humble Bundle"],
  microsoft: ["Microsoft Store", "Xbox"]
};

export async function fetchItadStoreLows(latest: LatestPrices): Promise<ItadHistoryFile> {
  const key = process.env.ITAD_API_KEY;
  if (!key) {
    const hasOauthCredentials = Boolean(process.env.ITAD_CLIENT_ID || process.env.ITAD_CLIENT_SECRET);
    return {
      timestamp: null,
      enabled: false,
      source: hasOauthCredentials
        ? "ITAD_API_KEY no configurada; las credenciales OAuth no sirven para endpoints públicos de precios"
        : "ITAD_API_KEY no configurada",
      matchedGames: 0,
      errors: [],
      entries: []
    };
  }

  const errors: string[] = [];
  const region = parseRegion(latest.region);
  const exchangeRate = await getExchangeRate(region);
  const shopIds = await fetchShopIds(key, region, errors);
  const supportedStores = STORES.filter((store) => shopIds[store] != null && store !== "microsoft");
  const titles = latest.prices.map((row) => row.gameTitle);
  const lookup = await postItad<ItadLookup>("/lookup/id/title/v1", key, {}, titles);
  const idToGame = new Map<string, { gameId: string; gameTitle: string }>();

  for (const row of latest.prices) {
    const itadId = lookup[row.gameTitle];
    if (itadId) idToGame.set(itadId, { gameId: row.gameId, gameTitle: row.gameTitle });
  }

  const entries: PriceHistoryEntry[] = [];
  const ids = [...idToGame.keys()];
  for (const chunk of chunkArray(ids, 200)) {
    const lows = await postItad<ItadStoreLow[]>(
      "/games/storelow/v2",
      key,
      {
          country: region,
        shops: supportedStores.map((store) => shopIds[store]).join(",")
      },
      chunk
    );

    for (const item of lows) {
      const game = idToGame.get(item.id);
      if (!game) continue;
      for (const low of item.lows ?? []) {
        const store = storeFromShop(low.shop, shopIds);
        if (!store || store === "microsoft") continue;
        const timestamp = low.timestamp ?? new Date().toISOString();
        const entry = makeItadHistoryEntry(exchangeRate, game.gameId, game.gameTitle, store, timestamp, {
          finalPrice: low.price?.amount ?? null,
          basePrice: low.regular?.amount ?? low.price?.amount ?? null,
          currency: low.price?.currency ?? low.regular?.currency ?? null,
          discountPct: typeof low.cut === "number" ? low.cut : null,
          url: low.url ?? null,
          raw: low
        });
        if (entry) entries.push(entry);
      }
    }
  }

  if (process.env.ITAD_HISTORY_FULL === "1") {
    for (const id of ids) {
      const game = idToGame.get(id);
      if (!game) continue;
      try {
        const history = await getItad<ItadHistoryLogEntry[]>("/games/history/v2", key, {
          id,
          country: region,
          shops: supportedStores.map((store) => shopIds[store]).join(","),
          since: process.env.ITAD_HISTORY_SINCE ?? "2024-01-01T00:00:00Z"
        });
        for (const item of history) {
          const store = storeFromShop(item.shop, shopIds);
          if (!store || store === "microsoft" || !item.timestamp) continue;
          const entry = makeItadHistoryEntry(exchangeRate, game.gameId, game.gameTitle, store, item.timestamp, {
            finalPrice: item.deal?.price?.amount ?? null,
            basePrice: item.deal?.regular?.amount ?? item.deal?.price?.amount ?? null,
            currency: item.deal?.price?.currency ?? item.deal?.regular?.currency ?? null,
            discountPct: typeof item.deal?.cut === "number" ? item.deal.cut : null,
            url: item.deal?.url ?? null,
            raw: item
          });
          if (entry) entries.push(entry);
        }
      } catch (error) {
        errors.push(error instanceof Error ? `history ${game.gameTitle}: ${error.message}` : `history ${game.gameTitle}: error`);
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    enabled: true,
    source: `IsThereAnyDeal storelow country=${region}`,
    matchedGames: idToGame.size,
    errors,
    entries
  };
}

export async function fetchItadFullHistoryForGames(latest: LatestPrices, gameIds: Set<string>): Promise<ItadHistoryFile> {
  const key = process.env.ITAD_API_KEY;
  if (!key || !gameIds.size) return { ...emptyItadHistory("ITAD_API_KEY no configurada"), entries: [] };

  const errors: string[] = [];
  const region = parseRegion(latest.region);
  const exchangeRate = await getExchangeRate(region);
  const shopIds = await fetchShopIds(key, region, errors);
  const supportedStores = STORES.filter((store) => shopIds[store] != null && store !== "microsoft");
  const selectedRows = latest.prices.filter((row) => gameIds.has(row.gameId));
  const lookup = await postItad<ItadLookup>("/lookup/id/title/v1", key, {}, selectedRows.map((row) => row.gameTitle));
  const idToGame = new Map<string, { gameId: string; gameTitle: string }>();

  for (const row of selectedRows) {
    const itadId = lookup[row.gameTitle];
    if (itadId) idToGame.set(itadId, { gameId: row.gameId, gameTitle: row.gameTitle });
  }

  const entries: PriceHistoryEntry[] = [];
  for (const [id, game] of idToGame) {
    try {
      const history = await getItad<ItadHistoryLogEntry[]>("/games/history/v2", key, {
        id,
        country: region,
        shops: supportedStores.map((store) => shopIds[store]).join(","),
        since: process.env.ITAD_HISTORY_SINCE ?? "2025-01-01T00:00:00Z"
      });
      for (const item of history) {
        const store = storeFromShop(item.shop, shopIds);
        if (!store || store === "microsoft" || !item.timestamp) continue;
        const entry = makeItadHistoryEntry(exchangeRate, game.gameId, game.gameTitle, store, item.timestamp, {
          finalPrice: item.deal?.price?.amount ?? null,
          basePrice: item.deal?.regular?.amount ?? item.deal?.price?.amount ?? null,
          currency: item.deal?.price?.currency ?? item.deal?.regular?.currency ?? null,
          discountPct: typeof item.deal?.cut === "number" ? item.deal.cut : null,
          url: item.deal?.url ?? null,
          raw: item
        });
        if (entry) entries.push(entry);
      }
    } catch (error) {
      errors.push(error instanceof Error ? `history ${game.gameTitle}: ${error.message}` : `history ${game.gameTitle}: error`);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    enabled: true,
    source: `IsThereAnyDeal history country=${region}`,
    matchedGames: idToGame.size,
    errors,
    entries
  };
}

export async function fetchItadCurrentPrices(
  games: SampleGame[],
  region: RegionConfig,
  exchangeRate: ExchangeRate
): Promise<{
  prices: Map<string, Partial<Record<StoreId, NormalizedPrice>>>;
  matchedGames: number;
  updatedPrices: number;
  shopCoverage: Partial<Record<StoreId, number>>;
  errors: string[];
}> {
  const key = process.env.ITAD_API_KEY;
  if (!key) {
    return {
      prices: new Map(),
      matchedGames: 0,
      updatedPrices: 0,
      shopCoverage: {},
      errors: ["ITAD_API_KEY no configurada"]
    };
  }

  const errors: string[] = [];
  const shopIds = await fetchShopIds(key, region.id, errors);
  const supportedStores = STORES.filter((store) => shopIds[store] != null && store !== "microsoft");
  const lookup = await lookupItadIds(games, key, errors);
  const idToGame = new Map<string, SampleGame>();

  for (const game of games) {
    const itadId = lookup[game.title];
    if (itadId) idToGame.set(itadId, game);
  }

  const prices = new Map<string, Partial<Record<StoreId, NormalizedPrice>>>();
  const shopCoverage: Partial<Record<StoreId, number>> = {};
  let updatedPrices = 0;
  const fetchedAt = new Date().toISOString();

  for (const chunk of chunkArray([...idToGame.keys()], 200)) {
    let result: ItadCurrentPriceEntry[] = [];
    try {
      result = await postItad<ItadCurrentPriceEntry[]>(
        "/games/prices/v3",
        key,
        {
          country: region.id,
          shops: supportedStores.map((store) => shopIds[store]).join(","),
          vouchers: "false"
        },
        chunk
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Error consultando precios actuales ITAD");
      continue;
    }

    for (const item of result) {
      const game = idToGame.get(item.id);
      if (!game) continue;
      const byStore = new Map<StoreId, NormalizedPrice>();

      for (const deal of item.deals ?? []) {
        const store = storeFromShop(deal.shop, shopIds);
        if (!store || store === "microsoft") continue;
        const finalPrice = deal.price?.amount ?? null;
        if (finalPrice == null || finalPrice <= 0) continue;
        const normalized = normalizePrice(
          {
            store,
            title: game.title,
            available: true,
            basePrice: deal.regular?.amount ?? deal.price?.amount ?? null,
            finalPrice,
            currency: deal.price?.currency ?? deal.regular?.currency ?? null,
            discountPct: typeof deal.cut === "number" ? deal.cut : null,
            url: deal.url ?? null,
            raw: deal,
            source: "itad",
            fetchedAt
          },
          exchangeRate
        );
        if (normalized.arsFinalPrice == null) continue;
        const current = byStore.get(store);
        if (current?.arsFinalPrice != null && current.arsFinalPrice <= normalized.arsFinalPrice) continue;
        byStore.set(store, normalized);
      }

      if (!byStore.size) continue;
      prices.set(game.id, Object.fromEntries(byStore.entries()) as Partial<Record<StoreId, NormalizedPrice>>);
      for (const store of byStore.keys()) {
        updatedPrices += 1;
        shopCoverage[store] = (shopCoverage[store] ?? 0) + 1;
      }
    }
  }

  return {
    prices,
    matchedGames: idToGame.size,
    updatedPrices,
    shopCoverage,
    errors
  };
}

async function fetchShopIds(key: string, country: string, errors: string[]): Promise<Partial<Record<StoreId, number>>> {
  try {
    const shops = await getItad<ItadShop[]>("/service/shops/v1", key, { country });
    return Object.fromEntries(
      STORES.map((store) => {
        const names = ITAD_STORE_NAMES[store].map((name) => name.toLowerCase());
        const shop = shops.find((item) => names.includes(shopTitle(item).toLowerCase()));
        return [store, shop?.id ?? null];
      })
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "No se pudo cargar el mapa de tiendas ITAD");
    return { steam: 61, gog: 35 };
  }
}

async function lookupItadIds(games: SampleGame[], key: string, errors: string[]): Promise<ItadLookup> {
  const lookup: ItadLookup = {};
  for (const chunk of chunkArray(games.map((game) => game.title), 200)) {
    try {
      Object.assign(lookup, await postItad<ItadLookup>("/lookup/id/title/v1", key, {}, chunk));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Error resolviendo IDs ITAD");
    }
  }
  return lookup;
}

function storeFromShop(shop: ItadShop | undefined, shopIds: Partial<Record<StoreId, number>>): StoreId | null {
  if (!shop) return null;
  const byId = STORES.find((store) => shopIds[store] === shop.id);
  if (byId) return byId;
  const normalized = shopTitle(shop).toLowerCase();
  return STORES.find((store) => ITAD_STORE_NAMES[store].some((name) => name.toLowerCase() === normalized)) ?? null;
}

function shopTitle(shop: ItadShop): string {
  return shop.name ?? shop.title ?? "";
}

async function getItad<T>(path: string, key: string, params: Record<string, string | number | boolean>): Promise<T> {
  const url = itadUrl(path, key, params);
  const response = await fetch(url, { headers: { accept: "application/json", "ITAD-API-Key": key } });
  if (!response.ok) throw new Error(`ITAD ${path} HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function postItad<T>(path: string, key: string, params: Record<string, string | number | boolean>, body: unknown): Promise<T> {
  const url = itadUrl(path, key, params);
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "ITAD-API-Key": key },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`ITAD ${path} HTTP ${response.status}`);
  return (await response.json()) as T;
}

function itadUrl(path: string, key: string, params: Record<string, string | number | boolean>): string {
  const url = new URL(`${ITAD_API}${path}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(name, String(value));
  }
  return url.toString();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function makeItadHistoryEntry(
  exchangeRate: ExchangeRate,
  gameId: string,
  gameTitle: string,
  store: StoreId,
  timestamp: string,
  price: Pick<StorePrice, "basePrice" | "finalPrice" | "currency" | "discountPct" | "url" | "raw">
): PriceHistoryEntry | null {
  if (price.finalPrice == null || price.finalPrice <= 0) return null;
  const normalized = normalizePrice(
    {
      store,
      title: gameTitle,
      available: true,
      basePrice: price.basePrice,
      finalPrice: price.finalPrice,
      currency: price.currency,
      discountPct: price.discountPct,
      url: price.url,
      raw: price.raw,
      source: "itad"
    },
    exchangeRate
  );

  if (normalized.arsFinalPrice == null) return null;
  return {
    gameId,
    gameTitle,
    store,
    timestamp,
    originalCurrency: normalized.originalCurrency,
    originalFinalPrice: normalized.originalFinalPrice,
    originalBasePrice: normalized.originalBasePrice,
    arsFinalPrice: normalized.arsFinalPrice,
    arsBasePrice: normalized.arsBasePrice,
    discountPct: normalized.discountPct,
    url: normalized.url,
    source: "itad"
  };
}

function parseRegion(value: string | undefined): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

function emptyItadHistory(source: string): ItadHistoryFile {
  return {
    timestamp: null,
    enabled: false,
    source,
    matchedGames: 0,
    errors: [],
    entries: []
  };
}
