import { loadEnvConfig } from "@next/env";
import { promises as fs } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { appendLatestToHistory, compactOwnHistory } from "../src/lib/history";
import { REGIONS } from "../src/lib/regions";
import type { LatestPrices, PriceHistoryEntry } from "../src/lib/types";
loadEnvConfig(process.cwd());
const backup = path.join(process.cwd(), "artifacts", "history-recovery-current");
type History = { timestamp: string | null; entries: PriceHistoryEntry[] };
async function main() {
  if (process.argv.includes("--capture")) {
    await fs.mkdir(backup, { recursive: true });
    const files = (await fs.readdir(dataPath("generated"))).filter(name => /^(game-sample|latest-prices.*|price-history.*|itad.*history.*|pending-releases|catalog-expansion|steam-sale-refresh-cursor-.*)\.json(?:\.gz)?$/.test(name));
    for (const name of files) await fs.copyFile(dataPath("generated", name), path.join(backup, name));
    console.log(JSON.stringify({ captured: files.length })); return;
  }
  const historical = await Promise.all(REGIONS.map(async region => {
    const suffix = region.id === "AR" ? "" : `-${region.id}`;
    return {
      suffix,
      history: await readJson<History>(dataPath("generated", `price-history${suffix}.json`), { timestamp: null, entries: [] }),
      latest: await readJson<LatestPrices>(dataPath("generated", `latest-prices${suffix}.json`), { timestamp: null, prices: [], errors: [], usdToArs: 0 })
    };
  }));
  // Restore the current catalog/prices before merging only real historical observations.
  for (const name of await fs.readdir(backup)) await fs.copyFile(path.join(backup, name), dataPath("generated", name));
  const results = [];
  for (const item of historical) {
    const historyPath = dataPath("generated", `price-history${item.suffix}.json`);
    const current = await readJson<History>(historyPath, { timestamp: null, entries: [] });
    const entries = compactOwnHistory([...current.entries, ...item.history.entries]);
    await writeJson(historyPath, { timestamp: current.timestamp, entries });
    await appendLatestToHistory(item.latest);
    const latest = await readJson<LatestPrices>(dataPath("generated", `latest-prices${item.suffix}.json`), { timestamp: null, prices: [], errors: [], usdToArs: 0 });
    await appendLatestToHistory(latest);
    const recovered = await readJson<History>(historyPath, { timestamp: null, entries: [] });
    results.push({ region: item.suffix || "AR", before: current.entries.length, after: recovered.entries.length });
  }
  for (const name of (await fs.readdir(backup)).filter(name => name === "game-sample.json" || /^latest-prices.*\.json$/.test(name))) {
    assert.ok((await fs.readFile(path.join(backup, name))).equals(await fs.readFile(dataPath("generated", name))), "History recovery must not change current catalog or prices");
  }
  console.log(JSON.stringify({ recovered: true, currentPricesPreserved: true, results }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "History recovery failed"); process.exitCode = 1; });
