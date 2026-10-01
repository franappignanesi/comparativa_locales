import { promises as fs } from "node:fs";
import { getWeekendGames } from "../src/lib/weekend-games";
import type { GameCandidate, GameSample } from "../src/lib/types";

async function main() {
  const candidates: GameCandidate[] = JSON.parse(await fs.readFile("data/game-candidates.json", "utf8"));
  const previous: GameCandidate[] = JSON.parse(await fs.readFile("data/weekend-catalog-additions.json", "utf8"));
  const sample: GameSample = JSON.parse(await fs.readFile("data/generated/game-sample.json", "utf8"));
  const known = new Set([...candidates, ...sample.broadSample, ...previous].map((g) => g.identifiers.steamAppId));
  const additions = previous.map((game) => ({ ...game, ...(game.notes.includes("Free to play.") ? { isFree: true } : {}) }));
  const failures: number[] = [];
  for (const game of getWeekendGames().filter((g) => !known.has(g.steamAppId))) {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.steamAppId}&cc=AR&l=english`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const app = payload[String(game.steamAppId)];
      if (!app?.success || app.data?.type !== "game") throw new Error("Not a verified game");
      const tags: string[] = (app.data.genres ?? []).map((g: { description: string }) => g.description);
      const year = Number(app.data.release_date?.date?.match(/\b(19|20)\d{2}\b/)?.[0]) || 0;
      additions.push({ title: game.title, ...(app.data.is_free ? { isFree: true } : {}), edition: "standard", category: "AA", primaryTag: tags[0] ?? null,
        steamTags: tags, coverUrl: game.coverUrl ?? app.data.header_image, releaseYear: year,
        notes: `Shux Juego del finde. Verified Steam app ${game.steamAppId}.${app.data.is_free ? " Free to play." : ""}${app.data.release_date?.coming_soon ? " Coming soon; no published price yet." : ""}`,
        expectedStores: ["steam"], identifiers: { steamAppId: game.steamAppId }, confidence: "high" });
      console.log(JSON.stringify({ appId: game.steamAppId, title: game.title, free: app.data.is_free, comingSoon: app.data.release_date?.coming_soon }));
    } catch (error) { failures.push(game.steamAppId); console.error(game.steamAppId, String(error)); }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await fs.writeFile("data/weekend-catalog-additions.json", `${JSON.stringify(additions, null, 2)}\n`);
  const { buildGameSample } = await import("../src/lib/sample-builder");
  const result = await buildGameSample();
  console.log(JSON.stringify({ added: additions.length - previous.length, totalAdditions: additions.length, broadSample: result.broadSample.length, failures }));
  if (failures.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
