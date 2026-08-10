import type { SampleGame, StorePrice } from "../types";
import type { RegionConfig } from "../regions";

type SteamPayload = {
  success?: boolean;
  data?: {
    name?: string;
    price_overview?: SteamPriceOverview;
  } & Record<string, unknown>;
};

type SteamPackagePayload = {
  success?: boolean;
  data?: {
    name?: string;
    price?: SteamPriceOverview;
  } & Record<string, unknown>;
};

type SteamPriceOverview = {
  initial: number;
  final: number;
  currency: string;
  discount_percent?: number;
};

export async function fetchStorePrice(game: SampleGame, region?: RegionConfig): Promise<StorePrice> {
  const prices = await fetchStorePrices([game], 1, region);
  return prices.get(game.id) ?? unavailable(game.title, "Steam no devolvio resultado");
}

export async function fetchStorePrices(games: SampleGame[], chunkSize = 50, region?: RegionConfig): Promise<Map<string, StorePrice>> {
  const result = new Map<string, StorePrice>();
  const gamesWithPackageId = games.filter((game) => Boolean(game.identifiers.steamSubId));
  const gamesWithAppId = games.filter((game) => Boolean(game.identifiers.steamAppId) && !game.identifiers.steamSubId);
  const sleepMs = parseNonNegativeInt(process.env.STEAM_CHUNK_SLEEP_MS) ?? 2500;

  if (process.env.STEAM_FORCE_SINGLE_REQUESTS === "1") {
    const individual = await fetchStorePricesIndividually(gamesWithAppId, region, sleepMs);
    for (const [gameId, price] of individual) result.set(gameId, price);
  } else {
    for (let index = 0; index < gamesWithAppId.length; index += chunkSize) {
      const chunk = gamesWithAppId.slice(index, index + chunkSize);
      const appIds = chunk.map((game) => game.identifiers.steamAppId).join(",");
      const url = steamDetailsUrl(appIds, region);

      try {
        logSteamChunk("start", region, index, chunk.length);
        const response = await fetchSteam(url);
        if (!response.ok) {
          logSteamChunk(`http_${response.status}`, region, index, chunk.length);
          if (chunk.length > 1 && response.status === 400) {
            const fallback = await fetchStorePricesIndividually(chunk, region, sleepMs);
            for (const [gameId, price] of fallback) result.set(gameId, price);
            continue;
          }
          for (const game of chunk) result.set(game.id, unavailable(game.title, `Steam HTTP ${response.status}`));
          continue;
        }
        const json = (await response.json()) as Record<string, SteamPayload>;
        for (const game of chunk) {
          result.set(game.id, parseSteamPayload(game, json[String(game.identifiers.steamAppId)]));
        }
        logSteamChunk("done", region, index, chunk.length);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        logSteamChunk(`error:${message}`, region, index, chunk.length);
        for (const game of chunk) result.set(game.id, unavailable(game.title, message));
      }

      if (sleepMs > 0 && index + chunkSize < gamesWithAppId.length) await sleep(sleepMs);
    }
  }

  const packagePrices = await fetchSteamPackagePrices(gamesWithPackageId, region, sleepMs);
  for (const [gameId, price] of packagePrices) result.set(gameId, price);

  for (const game of games.filter((item) => !item.identifiers.steamAppId && !item.identifiers.steamSubId)) {
    result.set(game.id, unavailable(game.title, "Sin steamAppId ni steamSubId"));
  }

  return result;
}

async function fetchSteamPackagePrices(
  games: SampleGame[],
  region: RegionConfig | undefined,
  sleepMs: number
): Promise<Map<string, StorePrice>> {
  const result = new Map<string, StorePrice>();
  const chunkSize = Math.max(1, Math.floor(Number(process.env.STEAM_PACKAGE_CHUNK_SIZE) || 25));

  for (let index = 0; index < games.length; index += chunkSize) {
    const chunk = games.slice(index, index + chunkSize);
    const packageIds = chunk.map((game) => game.identifiers.steamSubId).join(",");
    try {
      const response = await fetchSteam(steamPackageDetailsUrl(packageIds, region));
      if (!response.ok) {
        for (const game of chunk) result.set(game.id, unavailable(game.title, `Steam package HTTP ${response.status}`));
      } else {
        const json = (await response.json()) as Record<string, SteamPackagePayload>;
        for (const game of chunk) {
          result.set(game.id, parseSteamPackagePayload(game, json[String(game.identifiers.steamSubId)]));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      for (const game of chunk) result.set(game.id, unavailable(game.title, message));
    }
    if (sleepMs > 0 && index + chunkSize < games.length) await sleep(sleepMs);
  }

  return result;
}

async function fetchStorePricesIndividually(
  games: SampleGame[],
  region: RegionConfig | undefined,
  sleepMs: number
): Promise<Map<string, StorePrice>> {
  const result = new Map<string, StorePrice>();
  const concurrency = Math.max(1, parseNonNegativeInt(process.env.STEAM_SINGLE_CONCURRENCY) ?? 4);

  for (let index = 0; index < games.length; index += concurrency) {
    const group = games.slice(index, index + concurrency);
    const prices = await Promise.all(
      group.map(async (game) => {
        try {
          const response = await fetchSteam(steamDetailsUrl(String(game.identifiers.steamAppId), region));
          if (!response.ok) return [game.id, unavailable(game.title, `Steam HTTP ${response.status}`)] as const;
          const json = (await response.json()) as Record<string, SteamPayload>;
          return [game.id, parseSteamPayload(game, json[String(game.identifiers.steamAppId)])] as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          return [game.id, unavailable(game.title, message)] as const;
        }
      })
    );
    for (const [gameId, price] of prices) result.set(gameId, price);
    logSteamChunk("individual_done", region, index, group.length);
    if (sleepMs > 0 && index + concurrency < games.length) await sleep(sleepMs);
  }

  return result;
}

function steamDetailsUrl(appIds: string, region?: RegionConfig): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appIds}&cc=${region?.steamCc ?? "AR"}&l=spanish&filters=price_overview,basic`;
}

function steamPackageDetailsUrl(packageIds: string, region?: RegionConfig): string {
  return `https://store.steampowered.com/api/packagedetails?packageids=${packageIds}&cc=${region?.steamCc ?? "AR"}&l=spanish&filters=price`;
}

async function fetchSteam(url: string): Promise<Response> {
  const retries = parseNonNegativeInt(process.env.STEAM_429_RETRIES) ?? 4;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutMs = parseNonNegativeInt(process.env.STEAM_REQUEST_TIMEOUT_MS) ?? 12000;
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "BARATEAM price refresh" },
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
      next: { revalidate: 3600 }
    });
    if (response.status !== 429 || attempt === retries) return response;
    await sleep(retryDelayMs(response, attempt));
  }
  throw new Error("Steam retry loop exhausted");
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const base = parseNonNegativeInt(process.env.STEAM_429_BACKOFF_MS) ?? 15000;
  return base * (attempt + 1);
}

function parseNonNegativeInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logSteamChunk(event: string, region: RegionConfig | undefined, index: number, size: number): void {
  if (process.env.GITHUB_ACTIONS !== "true" && process.env.GLITCHPRICE_LOG_STEAM_CHUNKS !== "1") return;
  console.log(
    JSON.stringify({
      event: "steam_chunk",
      status: event,
      region: region?.id ?? "AR",
      offset: index,
      size
    })
  );
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

function parseSteamPackagePayload(game: SampleGame, payload: SteamPackagePayload | undefined): StorePrice {
  const packageId = game.identifiers.steamSubId;
  if (!payload?.success) return unavailable(game.title, "Steam no devolvio paquete exitoso");
  const data = payload.data;
  const price = data?.price;

  if (!price) {
    return {
      store: "steam",
      title: data?.name ?? game.title,
      available: false,
      basePrice: null,
      finalPrice: null,
      currency: null,
      discountPct: null,
      url: packageId ? `https://store.steampowered.com/sub/${packageId}` : null,
      raw: data,
      error: "Sin precio de paquete Steam",
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
    url: packageId ? `https://store.steampowered.com/sub/${packageId}` : null,
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
