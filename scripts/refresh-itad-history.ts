import { loadEnvConfig } from "@next/env";
import { dataPath, writeJson } from "../src/lib/cache";
import { getPriceHistoryReport } from "../src/lib/history";
import { getLatestPrices } from "../src/lib/prices";
import { REGIONS, type RegionId } from "../src/lib/regions";

loadEnvConfig(process.cwd());

type Status = {
  timestamp: string;
  regions: Partial<
    Record<
      RegionId,
      {
        matchedGames: number;
        errors: number;
        ownSnapshots: number;
        source: string;
      }
    >
  >;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const regions = parseRegions(process.env.PRICE_REGIONS);
  const status: Status = {
    timestamp: new Date().toISOString(),
    regions: {}
  };

  for (const region of regions) {
    const latest = await getLatestPrices({ region });
    const history = await getPriceHistoryReport(latest, { refreshItad: true });
    status.regions[region] = {
      matchedGames: history.itad.matchedGames,
      errors: history.itad.errors.length,
      ownSnapshots: history.ownSnapshots,
      source: history.itad.source
    };
    await writeJson(dataPath("generated", "itad-history-refresh-status.json"), status);
  }

  console.log(JSON.stringify(status, null, 2));
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : REGIONS.map((region) => region.id);
}
