import { evaluateAllWishlistAlerts } from "../src/lib/wishlist-alerts";
import { REGIONS, type RegionId } from "../src/lib/regions";

const validRegions = new Set(REGIONS.map((region) => region.id));

async function runOnce() {
  const regions = parseRegions();
  const report = await evaluateAllWishlistAlerts(regions);
  console.log(
    JSON.stringify(
      {
        ok: true,
        timestamp: report.timestamp,
        usersChecked: report.usersChecked,
        regionsChecked: report.regionsChecked,
        alerts: report.alerts.length,
        delivered: report.delivered
      },
      null,
      2
    )
  );
}

async function main() {
  if (process.env.WISHLIST_ALERTS_WATCH !== "1") {
    await runOnce();
    return;
  }

  const intervalMinutes = Math.max(5, Number(process.env.WISHLIST_ALERTS_INTERVAL_MINUTES) || 60);
  await runOnce();
  setInterval(runOnce, intervalMinutes * 60 * 1000);
}

function parseRegions(): RegionId[] {
  const raw = process.env.PRICE_REGIONS;
  if (!raw) return REGIONS.map((region) => region.id);
  const regions = raw
    .split(",")
    .map((region) => region.trim().toUpperCase())
    .filter((region): region is RegionId => validRegions.has(region as RegionId));
  return regions.length ? regions : REGIONS.map((region) => region.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
