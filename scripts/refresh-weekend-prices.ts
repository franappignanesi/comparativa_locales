import { loadEnvConfig } from "@next/env";
import additions from "../data/weekend-catalog-additions.json";
import { getGameSample } from "../src/lib/sample-builder";
import { refreshPriceBatch } from "../src/lib/prices";
import { REGIONS } from "../src/lib/regions";

loadEnvConfig(process.cwd());

async function main() {
  const region = REGIONS.find((region) => region.id === process.env.PRICE_REGION);
  if (!region) throw new Error("A valid PRICE_REGION is required");
  const apps = new Set(additions.map((game) => game.identifiers.steamAppId));
  const sample = await getGameSample();
  const targets = (process.env.TARGET_PRICE_GAME_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const gameIds = targets.length ? new Set(targets) : new Set(sample.broadSample.filter((game) => apps.has(game.identifiers.steamAppId!)).map((game) => game.id));
  if (!targets.length && gameIds.size !== apps.size) throw new Error("Some curated games are missing from the catalog");
  if (gameIds.size > 200 || [...gameIds].some((id) => !sample.broadSample.some((game) => game.id === id))) throw new Error("Invalid or oversized targeted refresh");
  const result = await refreshPriceBatch({ region: region.id, gameIds, offset: 0, limit: gameIds.size });
  const rows = result.latest.prices.filter((game) => gameIds.has(game.gameId));
  const priced = rows.filter((row) => Object.values(row.prices).some((price) => price?.available && price.arsFinalPrice != null)).length;
  console.log(JSON.stringify({ region: region.id, refreshed: result.refreshed, priced, totalCatalogRows: result.latest.prices.length }));
  if (result.refreshed !== gameIds.size || priced === 0) throw new Error("Curated refresh did not produce valid prices");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
