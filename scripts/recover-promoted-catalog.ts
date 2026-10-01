import { promises as fs } from "node:fs";
import path from "node:path";
import { getGameSample } from "../src/lib/sample-builder";
import type { GameCandidate } from "../src/lib/types";

async function main() {
  const artifact = process.argv[2];
  if (!artifact) throw new Error("Pass the downloaded catalog-state artifact directory");
  const source: GameCandidate[] = JSON.parse(await fs.readFile("data/game-candidates.json", "utf8"));
  const recovered: GameCandidate[] = JSON.parse(await fs.readFile(path.join(artifact, "game-candidates.json"), "utf8"));
  const sample = await getGameSample();
  const known = new Set([...source, ...sample.broadSample].map((game) => game.identifiers.steamAppId));
  const added: GameCandidate[] = [];
  for (const candidate of recovered.filter((game) => !known.has(game.identifiers.steamAppId))) {
    const id = candidate.identifiers.steamAppId;
    if (!Number.isSafeInteger(id)) throw new Error("Invalid Steam app ID in artifact");
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=AR&l=english`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Steam HTTP ${response.status} for ${id}`);
    const app = (await response.json())[String(id)];
    if (!app?.success || app.data?.type !== "game" || app.data.release_date?.coming_soon || !app.data.price_overview?.initial) {
      console.log(JSON.stringify({ skipped: id, title: candidate.title, reason: "Not a verified released paid game" }));
      continue;
    }
    added.push(candidate);
    console.log(JSON.stringify({ recovered: id, title: candidate.title }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await fs.writeFile("data/game-candidates.json", `${JSON.stringify([...source, ...added], null, 2)}\n`);
  console.log(JSON.stringify({ added: added.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
