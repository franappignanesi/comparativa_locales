import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { REGIONS, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, StoreId } from "../src/lib/types";
import { STORES } from "../src/lib/types";

loadEnvConfig(process.cwd());

type AuditGame = {
  gameId: string;
  title: string;
  category: string;
  releaseYear: number;
  coverUrl?: string | null;
  pricedStoresByRegion: Record<RegionId, StoreId[]>;
};

type RegionalAuditSample = {
  timestamp: string;
  regions: RegionId[];
  stores: StoreId[];
  criteria: {
    regionalComparable: string;
    regionalStrict: string;
    regionalStoreComparable: string;
  };
  counts: {
    totalCandidates: number;
    regionalComparable: number;
    regionalStrict: number;
    regionalStoreComparable: Record<StoreId, number>;
  };
  perRegion: Record<
    RegionId,
    {
      rows: number;
      rowsWithAnyPrice: number;
      rowsWithTwoOrMoreStores: number;
      coverage: Record<StoreId, number>;
    }
  >;
  regionalComparable: AuditGame[];
  regionalStrict: AuditGame[];
  regionalStoreComparable: Record<StoreId, AuditGame[]>;
  rejected: Array<{
    gameId: string;
    title: string;
    missingRegions: RegionId[];
    reason: string;
  }>;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const sample = await getGameSample();
  const regions = parseRegions(process.env.PRICE_REGIONS);
  const latestByRegion = Object.fromEntries(
    await Promise.all(regions.map(async (region) => [region, await readJson<LatestPrices>(latestPricesPath(region), emptyLatest(region))]))
  ) as Record<RegionId, LatestPrices>;
  const rowsByRegion = Object.fromEntries(
    regions.map((region) => [region, new Map(latestByRegion[region].prices.map((row) => [row.gameId, row]))])
  ) as Record<RegionId, Map<string, LatestPrices["prices"][number]>>;

  const games: AuditGame[] = sample.broadSample.map((game) => ({
    gameId: game.id,
    title: game.title,
    category: game.category,
    releaseYear: game.releaseYear,
    coverUrl: game.coverUrl,
    pricedStoresByRegion: Object.fromEntries(
      regions.map((region) => [region, pricedStores(rowsByRegion[region].get(game.id))])
    ) as Record<RegionId, StoreId[]>
  }));

  const regionalComparable = games.filter((game) => regions.every((region) => game.pricedStoresByRegion[region].length >= 2));
  const regionalStrict = games.filter((game) => regions.every((region) => game.pricedStoresByRegion[region].length === STORES.length));
  const regionalStoreComparable = Object.fromEntries(
    STORES.map((store) => [store, games.filter((game) => regions.every((region) => game.pricedStoresByRegion[region].includes(store)))])
  ) as Record<StoreId, AuditGame[]>;
  const rejected = games
    .filter((game) => !regionalComparable.some((item) => item.gameId === game.gameId))
    .map((game) => {
      const missingRegions = regions.filter((region) => game.pricedStoresByRegion[region].length < 2);
      return {
        gameId: game.gameId,
        title: game.title,
        missingRegions,
        reason: "No alcanza 2 tiendas con precio en todas las regiones seleccionadas"
      };
    });

  const audit: RegionalAuditSample = {
    timestamp: new Date().toISOString(),
    regions,
    stores: STORES,
    criteria: {
      regionalComparable: "Juego con precio disponible en 2 o mas tiendas en cada region seleccionada",
      regionalStrict: "Juego con precio disponible en las 5 tiendas en cada region seleccionada",
      regionalStoreComparable: "Juego con precio disponible en la misma tienda para cada region seleccionada"
    },
    counts: {
      totalCandidates: sample.broadSample.length,
      regionalComparable: regionalComparable.length,
      regionalStrict: regionalStrict.length,
      regionalStoreComparable: Object.fromEntries(
        STORES.map((store) => [store, regionalStoreComparable[store].length])
      ) as Record<StoreId, number>
    },
    perRegion: Object.fromEntries(regions.map((region) => [region, summarize(latestByRegion[region])])) as RegionalAuditSample["perRegion"],
    regionalComparable,
    regionalStrict,
    regionalStoreComparable,
    rejected
  };

  await writeJson(dataPath("generated", "regional-audit-sample.json"), audit);
  console.log(JSON.stringify(audit.counts, null, 2));
}

function pricedStores(row: LatestPrices["prices"][number] | undefined): StoreId[] {
  if (!row) return [];
  return STORES.filter((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null);
}

function summarize(latest: LatestPrices): RegionalAuditSample["perRegion"][RegionId] {
  return {
    rows: latest.prices.length,
    rowsWithAnyPrice: latest.prices.filter((row) => pricedStores(row).length >= 1).length,
    rowsWithTwoOrMoreStores: latest.prices.filter((row) => pricedStores(row).length >= 2).length,
    coverage: Object.fromEntries(
      STORES.map((store) => [
        store,
        latest.prices.filter((row) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null).length
      ])
    ) as Record<StoreId, number>
  };
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : REGIONS.map((region) => region.id);
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}

function emptyLatest(region: RegionId): LatestPrices {
  return {
    timestamp: null,
    region,
    usdToArs: 0,
    prices: [],
    errors: []
  };
}
