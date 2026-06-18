import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { buildGameSample } from "../src/lib/sample-builder";
import type { GameCandidate } from "../src/lib/types";

loadEnvConfig(process.cwd());

type DiscoveryFile = {
  timestamp: string;
  source: string;
  generated: number;
  candidates: GameCandidate[];
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const approveLimit = parsePositiveInt(process.env.CATALOG_APPROVE_LIMIT) ?? 2000;
  const minReviews = parsePositiveInt(process.env.CATALOG_APPROVE_MIN_REVIEWS) ?? parsePositiveInt(process.env.CATALOG_MIN_REVIEWS) ?? 500;
  const existing = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const discovery = await readJson<DiscoveryFile | null>(dataPath("generated", "steam-discovery-candidates.json"), null);

  if (!discovery?.candidates?.length) {
    throw new Error("No hay data/generated/steam-discovery-candidates.json. Ejecuta npm run catalog:discover-steam primero.");
  }

  const existingSteamIds = new Set(existing.map((game) => game.identifiers.steamAppId).filter(Boolean));
  const existingTitles = new Set(existing.map((game) => normalizeTitle(game.title)));
  const approved = discovery.candidates
    .filter((game) => !existingSteamIds.has(game.identifiers.steamAppId))
    .filter((game) => !existingTitles.has(normalizeTitle(game.title)))
    .filter((game) => metricFromNotes(game.notes, "Reviews") >= minReviews)
    .filter((game) => game.expectedStores.includes("steam") && Boolean(game.identifiers.steamAppId))
    .slice(0, approveLimit);

  const promotedAt = new Date().toISOString();
  const promoted = approved.map((game) => ({
    ...game,
    notes: `${game.notes} Promovido automaticamente ${promotedAt}.`,
    confidence: "high" as const
  }));

  await writeJson(dataPath("game-candidates.json"), [...existing, ...promoted]);
  const sample = await buildGameSample();

  console.log(
    JSON.stringify(
      {
        source: discovery.source,
        discovered: discovery.generated,
        approved: promoted.length,
        totalCandidates: existing.length + promoted.length,
        broadSample: sample.broadSample.length,
        strictSample: sample.strictSample.length,
        minReviews
      },
      null,
      2
    )
  );
}

function metricFromNotes(notes: string, label: string): number {
  const match = notes.match(new RegExp(`${label}:\\s*([\\d.]+)`));
  return match ? Number(match[1]) : 0;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
