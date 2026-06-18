import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import type { GameCandidate } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SteamSpyDetails = {
  genre?: string;
  tags?: Record<string, number>;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const candidates = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const byAppId = new Map<number, { tags: string[]; primaryTag: string | null }>();
  const appIds = candidates
    .filter((candidate) => !candidate.primaryTag || !candidate.steamTags?.length)
    .map((candidate) => candidate.identifiers.steamAppId)
    .filter((appId): appId is number => Boolean(appId));

  await mapWithConcurrency(appIds, Number(process.env.STEAM_TAG_CONCURRENCY ?? 8), async (appId) => {
    if (process.env.STEAM_TAG_SLEEP_MS) await sleep(Number(process.env.STEAM_TAG_SLEEP_MS));
    const response = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
    if (!response.ok) return;
    const details = (await response.json()) as SteamSpyDetails;
    const tags = Object.keys(details.tags ?? {});
    const genreTags = (details.genre ?? "")
      .split(",")
      .map((genre) => genre.trim())
      .filter(Boolean);
    const mergedTags = [...new Set([...tags, ...genreTags])].slice(0, 16);
    byAppId.set(appId, { tags: mergedTags, primaryTag: primaryTag(mergedTags) });
  });

  let enriched = 0;
  const nextCandidates = candidates.map((candidate) => {
    const appId = candidate.identifiers.steamAppId;
    const steam = appId ? byAppId.get(appId) : null;
    if (!steam) return candidate;
    if (!steam.primaryTag && !steam.tags.length) return candidate;
    enriched += 1;
    return {
      ...candidate,
      primaryTag: steam.primaryTag ?? candidate.primaryTag ?? null,
      steamTags: steam.tags.length ? steam.tags : candidate.steamTags
    };
  });

  await writeJson(dataPath("game-candidates.json"), nextCandidates);
  console.log(JSON.stringify({ total: candidates.length, enriched, requested: appIds.length }, null, 2));
}

function primaryTag(tags: string[]): string | null {
  const priority = ["Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Sports", "Racing", "Casual", "Massively Multiplayer", "Multiplayer"];
  return priority.find((tag) => tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) ?? tags[0] ?? null;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, mapper: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await mapper(item);
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
