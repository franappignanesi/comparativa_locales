import assert from "node:assert/strict";
import { test } from "node:test";
import additions from "../data/weekend-catalog-additions.json";
import { withCuratedGames } from "../src/lib/sample-builder";
import type { GameSample } from "../src/lib/types";
import { getGameSample } from "../src/lib/sample-builder";
import { getWeekendGames } from "../src/lib/weekend-games";

test("curated games survive an older dataset restored from cache, without duplicates", () => {
  const cached: GameSample = { timestamp: "2026-06-01", broadSample: [], strictSample: [], rejected: [], missingByStore: {}, storeCoverage: {}, categoryCoverage: {} };
  const first = withCuratedGames(cached);
  assert.equal(first.broadSample.length, additions.length);
  assert.equal(new Set(first.broadSample.map((game) => game.id)).size, additions.length);
  assert.equal(first.storeCoverage.steam, additions.length);
  assert.equal(withCuratedGames(first).broadSample.length, additions.length);
  const oldMetadata = { ...first, broadSample: first.broadSample.map((game) => ({ ...game, isFree: undefined })) };
  assert.equal(withCuratedGames(oldMetadata).broadSample.filter((game) => game.isFree).length, 4);
  assert.equal(cached.broadSample.length, 0);
});

test("all video recommendations have real catalog entries, including the latest recommendation", async () => {
  const sample = await getGameSample();
  const apps = new Set(sample.broadSample.map((game) => game.identifiers.steamAppId));
  assert.deepEqual(getWeekendGames().filter((game) => !apps.has(game.steamAppId)).map((game) => game.title), []);
});
