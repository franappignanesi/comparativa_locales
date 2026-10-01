import { dataPath, writeJson } from "../src/lib/cache";
import { readFile } from "node:fs/promises";
import { emptyMicrosoftDiscovery, microsoftDiscoveryPath, type MicrosoftDiscoveryState } from "../src/lib/microsoft-discovery";
import { getGameSample } from "../src/lib/sample-builder";
import { discoverMicrosoftProduct } from "../src/lib/stores/microsoft";

async function main() {
  const sample = await getGameSample();
  const state: MicrosoftDiscoveryState = await readFile(microsoftDiscoveryPath(), "utf8").then((data) => JSON.parse(data)).catch(() => emptyMicrosoftDiscovery());
  const limit = Math.min(10000, Math.max(1, Number(process.env.MICROSOFT_DISCOVERY_LIMIT) || 150));
  const maxMs = Math.min(7200000, Math.max(1000, Number(process.env.MICROSOFT_DISCOVERY_MAX_MS) || 240000));
  const targets = process.env.MICROSOFT_DISCOVERY_GAME_IDS?.split(",");
  const cutoff = Date.now() - 30 * 86400000;
  const selected = sample.broadSample.filter((game) =>
    game.productKind !== "pack" &&
    !game.identifiers.microsoftProductId && !game.identifiers.microsoftUrl && !state.matches[game.id] &&
    (!targets || targets.includes(game.id)) && (!state.checkedAt[game.id] || Date.parse(state.checkedAt[game.id]) < cutoff)
  ).sort((a, b) => Number(b.expectedStores.includes("microsoft")) - Number(a.expectedStores.includes("microsoft"))).slice(0, limit);
  let cursor = 0;
  let completed = 0;
  let errors = 0;
  const found: Array<{ id: string; title: string; productId: string }> = [];
  const startedAt = Date.now();
  let checkpoint = Promise.resolve();
  const persist = () => {
    checkpoint = checkpoint.then(() => writeJson(microsoftDiscoveryPath(), state));
    return checkpoint;
  };
  console.log(JSON.stringify({ event: "microsoft_discovery_start", selected: selected.length, catalogTotal: sample.broadSample.length, maxMs, concurrency: 3 }));
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < selected.length && Date.now() - startedAt < maxMs) {
      const game = selected[cursor++];
      try {
        const productId = await discoverMicrosoftProduct(game);
        state.checkedAt[game.id] = new Date().toISOString();
        if (productId) { state.matches[game.id] = productId; found.push({ id: game.id, title: game.title, productId }); }
      } catch (error) {
        errors++;
        console.warn(`Microsoft discovery: ${game.id}: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && /HTTP 429/.test(error.message)) await new Promise((resolve) => setTimeout(resolve, 30000));
      }
      completed++;
      if (completed % 25 === 0) {
        await persist();
        console.log(`Microsoft discovery progress: ${completed}/${selected.length}, ${found.length} matches, ${errors} errors`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }));
  await persist();
  await writeJson(dataPath("generated", "game-sample.json"), await getGameSample());
  console.log(JSON.stringify({ checked: completed, selected: selected.length, remaining: selected.length - completed, stoppedReason: completed === selected.length ? "complete" : "time_budget", errors, totalMatches: Object.keys(state.matches).length, found }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
