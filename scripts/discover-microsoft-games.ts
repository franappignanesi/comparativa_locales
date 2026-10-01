import { dataPath, writeJson } from "../src/lib/cache";
import { readFile } from "node:fs/promises";
import { emptyMicrosoftDiscovery, microsoftDiscoveryPath, type MicrosoftDiscoveryState } from "../src/lib/microsoft-discovery";
import { getGameSample } from "../src/lib/sample-builder";
import { discoverMicrosoftProduct } from "../src/lib/stores/microsoft";

async function main() {
  const sample = await getGameSample();
  const state: MicrosoftDiscoveryState = await readFile(microsoftDiscoveryPath(), "utf8").then((data) => JSON.parse(data)).catch(() => emptyMicrosoftDiscovery());
  const limit = Math.min(500, Math.max(1, Number(process.env.MICROSOFT_DISCOVERY_LIMIT) || 150));
  const targets = process.env.MICROSOFT_DISCOVERY_GAME_IDS?.split(",");
  const cutoff = Date.now() - 30 * 86400000;
  const selected = sample.broadSample.filter((game) =>
    !game.identifiers.microsoftProductId && !game.identifiers.microsoftUrl && !state.matches[game.id] &&
    (!targets || targets.includes(game.id)) && (!state.checkedAt[game.id] || Date.parse(state.checkedAt[game.id]) < cutoff)
  ).sort((a, b) => Number(b.expectedStores.includes("microsoft")) - Number(a.expectedStores.includes("microsoft"))).slice(0, limit);
  let cursor = 0;
  let errors = 0;
  const found: Array<{ id: string; title: string; productId: string }> = [];
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < selected.length && Date.now() - startedAt < 240000) {
      const game = selected[cursor++];
      try {
        const productId = await discoverMicrosoftProduct(game);
        state.checkedAt[game.id] = new Date().toISOString();
        if (productId) { state.matches[game.id] = productId; found.push({ id: game.id, title: game.title, productId }); }
      } catch (error) {
        errors++;
        console.warn(`Microsoft discovery: ${game.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cursor % 25 === 0) console.log(`Microsoft discovery progress: ${cursor}/${selected.length}, ${found.length} matches`);
    }
  }));
  await writeJson(microsoftDiscoveryPath(), state);
  await writeJson(dataPath("generated", "game-sample.json"), await getGameSample());
  console.log(JSON.stringify({ checked: cursor, errors, totalMatches: Object.keys(state.matches).length, found }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
