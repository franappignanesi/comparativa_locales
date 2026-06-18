import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";

type SteamPayload = {
  success?: boolean;
  data?: {
    name?: string;
    price_overview?: {
      initial: number;
      final: number;
      currency: string;
      discount_percent?: number;
    };
  } & Record<string, unknown>;
};

export async function fetchStorePrice(game: SampleGame, region?: RegionConfig): Promise<StorePrice> {
  const prices = await fetchStorePrices([game], 1, region);
  return prices.get(game.id) ?? unavailable(game.title, "Steam no devolvio resultado");
}

export async function fetchStorePrices(games: SampleGame[], chunkSize = 50, region?: RegionConfig): Promise<Map<string, StorePrice>> {
  const result = new Map<string, StorePrice>();
  const gamesWithAppId = games.filter((game) => Boolean(game.identifiers.steamAppId));

  for (let index = 0; index < gamesWithAppId.length; index += chunkSize) {
    const chunk = gamesWithAppId.slice(index, index + chunkSize);
    const appIds = chunk.map((game) => game.identifiers.steamAppId).join(",");
    const url = `https://store.steampowered.com/api/appdetails?appids=${appIds}&cc=${region?.steamCc ?? "AR"}&l=spanish&filters=price_overview,basic`;

    try {
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (!response.ok) {
        for (const game of chunk) result.set(game.id, unavailable(game.title, `Steam HTTP ${response.status}`));
        continue;
      }
      const json = (await response.json()) as Record<string, SteamPayload>;
      for (const game of chunk) {
        result.set(game.id, parseSteamPayload(game, json[String(game.identifiers.steamAppId)]));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      for (const game of chunk) result.set(game.id, unavailable(game.title, message));
    }
  }

  for (const game of games.filter((item) => !item.identifiers.steamAppId)) {
    result.set(game.id, unavailable(game.title, "Sin steamAppId"));
  }

  return result;
}

function parseSteamPayload(game: SampleGame, payload: SteamPayload | undefined): StorePrice {
  const appId = game.identifiers.steamAppId;
  if (!payload?.success) return unavailable(game.title, "Steam no devolvio detalle exitoso");
  const data = payload.data;
  const price = data?.price_overview;

  if (!price) {
    return {
      store: "steam",
      title: data?.name ?? game.title,
      available: false,
      basePrice: null,
      finalPrice: null,
      currency: null,
      discountPct: null,
      url: appId ? `https://store.steampowered.com/app/${appId}` : null,
      raw: data,
      error: "Sin price_overview; puede no estar disponible o no tener precio AR",
      source: "live"
    };
  }

  return {
    store: "steam",
    title: data?.name ?? game.title,
    available: true,
    basePrice: price.initial / 100,
    finalPrice: price.final / 100,
    currency: price.currency,
    discountPct: price.discount_percent ?? null,
    url: appId ? `https://store.steampowered.com/app/${appId}` : null,
    raw: data,
    source: "live"
  };
}

function unavailable(title: string, error: string): StorePrice {
  return {
    store: "steam",
    title,
    available: false,
    basePrice: null,
    finalPrice: null,
    currency: null,
    discountPct: null,
    url: null,
    raw: null,
    error,
    source: "unavailable"
  };
}
