import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { compactLatestPrices } from "../src/lib/prices";
import type { RegionId } from "../src/lib/regions";
import type { LatestPrices } from "../src/lib/types";

const regions: RegionId[] = ["AR", "MX", "ES", "PE", "CL"];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const results = [];
  for (const region of regions) {
    const filePath = dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
    const before = await fileSize(filePath);
    const latest = await readJson<LatestPrices>(filePath, emptyLatest(region));
    await writeJson(filePath, compactLatestPrices(latest));
    const after = await fileSize(filePath);
    results.push({ region, before, after, saved: before - after });
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

async function fileSize(filePath: string): Promise<number> {
  const { stat } = await import("node:fs/promises");
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
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
