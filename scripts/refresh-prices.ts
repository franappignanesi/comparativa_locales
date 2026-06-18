import { loadEnvConfig } from "@next/env";
import { getPriceHistoryReport } from "../src/lib/history";
import { getLatestPrices, refreshPriceBatch } from "../src/lib/prices";
import { DEFAULT_REGION, REGIONS, type RegionId } from "../src/lib/regions";

loadEnvConfig(process.cwd());

const batchLimit = parsePositiveInt(process.env.PRICE_REFRESH_LIMIT);
const batchOffset = parseNonNegativeInt(process.env.PRICE_REFRESH_OFFSET);
const region = parseRegion(process.env.PRICE_REGION);

(batchLimit ? refreshPriceBatch({ limit: batchLimit, offset: batchOffset ?? 0, region }).then((result) => result.latest) : getLatestPrices({ refresh: true, region }))
  .then(async (latest) => {
    const history = await getPriceHistoryReport(latest, { refreshItad: true });
    console.log(
      JSON.stringify(
        {
          timestamp: latest.timestamp,
          games: latest.prices.length,
          errors: latest.errors.length,
          usdToArs: latest.usdToArs,
          usdToArsSource: latest.usdToArsSource,
          digitalVatRate: latest.digitalVatRate,
          ownHistorySnapshots: history.ownSnapshots,
          itadEnabled: history.itad.enabled,
          itadMatchedGames: history.itad.matchedGames,
          itadErrors: history.itad.errors.length
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parseRegion(value: string | undefined): RegionId {
  return REGIONS.some((item) => item.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
