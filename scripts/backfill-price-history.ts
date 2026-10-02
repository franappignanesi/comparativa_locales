import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { getLatestPrices } from "../src/lib/prices";
import { fetchItadFullHistoryForGames } from "../src/lib/itad";
import { mergeFullHistoryArchive, type FullHistoryArchive } from "../src/lib/history-backfill";
import { REGIONS } from "../src/lib/regions";

loadEnvConfig(process.cwd());
const empty: FullHistoryArchive = { timestamp: null, enabled: false, source: "", matchedGames: 0, errors: [], entries: [], checkedGames: {} };
const bounded = (value: string | undefined, fallback: number, maximum: number) => Math.min(maximum, Math.max(1, Math.floor(Number(value) || fallback)));

async function main() {
  if (!process.env.ITAD_API_KEY) throw new Error("History backfill requires the ITAD key");
  const selected = (process.env.PRICE_REGION ?? process.env.PRICE_REGIONS ?? "AR,MX,ES,PE,CL").split(",");
  const limit = bounded(process.env.HISTORY_BACKFILL_LIMIT, 500, 5000);
  const maxMs = bounded(process.env.HISTORY_BACKFILL_MAX_MS, 180000, 600000);
  for (const region of REGIONS.filter(region => selected.includes(region.id))) {
    const started = Date.now();
    const file = dataPath("generated", region.id === "AR" ? "itad-full-history.json" : `itad-full-history-${region.id}.json`);
    let archive = await readJson<FullHistoryArchive>(file, empty);
    const latest = await getLatestPrices({ region: region.id });
    const pending = latest.prices.filter(row => row.itadId || row.productKind !== "pack")
      .filter(row => {
        const checkedAt = Date.parse(archive.checkedGames?.[row.gameId] ?? "");
        return !Number.isFinite(checkedAt) || checkedAt > Date.now() || Date.now() - checkedAt >= 7 * 86400000;
      })
      .sort((a, b) => (archive.checkedGames?.[a.gameId] ?? "").localeCompare(archive.checkedGames?.[b.gameId] ?? ""));
    let checked = 0;
    let failures = 0;
    let consecutiveFailures = 0;
    let withHistory = 0;
    const before = archive.entries.length;
    for (const row of pending.slice(0, limit)) {
      if (Date.now() - started > maxMs - 20000) break;
      const incoming = await fetchItadFullHistoryForGames({ ...latest, prices: [row] }, new Set([row.gameId]));
      if (incoming.errors.length) {
        failures++;
        consecutiveFailures++;
        // Stop repeated source errors; already collected observations are saved after each game.
        if (consecutiveFailures >= 3) break;
      } else {
        consecutiveFailures = 0;
        if (incoming.entries.length) withHistory++;
        const now = new Date().toISOString();
        archive = mergeFullHistoryArchive(archive, { ...incoming, checkedGames: { [row.gameId]: now } });
        await writeJson(file, archive);
        checked++;
      }
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    console.log(JSON.stringify({ region: region.id, before, after: archive.entries.length, checked, withHistory, failures, pending: pending.length - checked, checkedTotal: Object.keys(archive.checkedGames ?? {}).length }));
    if (failures) console.warn(`::warning::${region.id}: ${failures} historical imports failed and remain pending; collected history was preserved.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
