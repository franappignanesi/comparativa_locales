import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { buildGameSample } from "../src/lib/sample-builder";
import type { GameCandidate } from "../src/lib/types";

loadEnvConfig(process.cwd());

type PendingRelease = {
  discoveredAt: string;
  updatedAt: string;
  appId: number;
  title: string;
  releaseDate: string | null;
  reviews: number;
  owners: number;
  score: number;
  status: "pending" | "fast_lane" | "rejected" | "promoted";
  reason: string;
  candidate?: GameCandidate;
};

type PendingReleaseFile = {
  timestamp: string;
  source: string;
  rules: string[];
  pending: PendingRelease[];
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const mode = (process.env.RELEASE_PROMOTE_MODE ?? "weekly").toLowerCase();
  const limit = parsePositiveInt(process.env.RELEASE_PROMOTE_LIMIT) ?? (mode === "fast" ? 25 : 75);
  const minReviews = parsePositiveInt(process.env.RELEASE_PROMOTE_MIN_REVIEWS) ?? (mode === "fast" ? 0 : 100);
  const minOwners = parsePositiveInt(process.env.RELEASE_PROMOTE_MIN_OWNERS) ?? (mode === "fast" ? 0 : 10000);
  const existing = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const pendingFile = await readJson<PendingReleaseFile | null>(dataPath("generated", "pending-releases.json"), null);

  if (!pendingFile?.pending?.length) {
    throw new Error("No hay data/generated/pending-releases.json. Ejecuta npm run releases:discover primero.");
  }

  const existingSteamIds = new Set(existing.map((game) => game.identifiers.steamAppId).filter(Boolean));
  const existingTitles = new Set(existing.map((game) => normalizeTitle(game.title)));
  const allowedStatuses = mode === "fast" ? new Set(["fast_lane"]) : new Set(["fast_lane", "pending"]);
  const approved = pendingFile.pending
    .filter((item) => allowedStatuses.has(item.status))
    .filter((item) => item.candidate)
    .filter((item) => !existingSteamIds.has(item.appId))
    .filter((item) => !existingTitles.has(normalizeTitle(item.title)))
    .filter((item) => item.status === "fast_lane" || item.reviews >= minReviews || item.owners >= minOwners)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const promotedAt = new Date().toISOString();
  const promoted = approved.map((item) => ({
    ...item.candidate!,
    notes: `${item.candidate!.notes} Promovido por release automation ${mode} ${promotedAt}.`,
    confidence: "high" as const
  }));

  await writeJson(dataPath("game-candidates.json"), [...existing, ...promoted]);
  const promotedIds = new Set(approved.map((item) => item.appId));
  await writeJson(dataPath("generated", "pending-releases.json"), {
    ...pendingFile,
    timestamp: promotedAt,
    pending: pendingFile.pending.map((item) => (promotedIds.has(item.appId) ? { ...item, status: "promoted", updatedAt: promotedAt } : item))
  });
  const sample = await buildGameSample();

  console.log(
    JSON.stringify(
      {
        mode,
        approved: promoted.length,
        limit,
        totalCandidates: existing.length + promoted.length,
        broadSample: sample.broadSample.length,
        strictSample: sample.strictSample.length,
        minReviews,
        minOwners
      },
      null,
      2
    )
  );
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
