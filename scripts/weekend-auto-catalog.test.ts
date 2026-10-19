import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getGameSample, withWeekendRecommendations } from "../src/lib/sample-builder";
import { getWeekendGames, type WeekendGame } from "../src/lib/weekend-games";
import type { GameSample } from "../src/lib/types";

test("every video recommendation is a real refreshable catalog entry, including Tenebris Somnia", async () => {
  const sample = await getGameSample();
  for (const recommendation of getWeekendGames()) {
    const matches = sample.broadSample.filter(game => game.identifiers.steamAppId === recommendation.steamAppId);
    assert.equal(matches.length, 1, recommendation.title);
    assert.ok(matches[0].availableStores.includes("steam"));
  }
  assert.ok(sample.broadSample.some(game => game.identifiers.steamAppId === 2121510));
});

test("recommendation overlay handles title collisions without replacing another game and is idempotent", () => {
  const empty = { timestamp: null, broadSample: [], strictSample: [], rejected: [], storeCoverage: {}, missingByStore: {}, categoryCoverage: {} } as GameSample;
  const recommendation = { steamAppId: 1, title: "Test", videoUrl: "https://www.instagram.com/p/test/", coverUrl: null } as WeekendGame;
  const first = withWeekendRecommendations(empty, [recommendation]);
  assert.equal(withWeekendRecommendations(first, [recommendation]), first);
  const second = withWeekendRecommendations(first, [{ ...recommendation, steamAppId: 2 }]);
  assert.equal(second.broadSample.length, 2);
  assert.equal(second.broadSample[1].id, "shux-steam-2");
});

test("curator imports trigger a price refresh before publishing", async () => {
  const workflow = await readFile(".github/workflows/shux-curator-import.yml", "utf8");
  assert.match(workflow, /uses: \.\/\.github\/workflows\/daily-price-refresh.yml/);
  assert.match(workflow, /weekend_games_only: true/);
  assert.match(workflow, /catalog_ref: main/);
  assert.doesNotMatch(workflow, /uses: \.\/\.github\/workflows\/deploy-production.yml/);
  const refresh = await readFile(".github/workflows/daily-price-refresh.yml", "utf8");
  assert.match(refresh, /workflow_call:/);
  assert.equal((refresh.match(/ref: \$\{\{ inputs.catalog_ref \|\| github.sha \}\}/g) ?? []).length, 3);
  assert.doesNotMatch(refresh, /github.event.inputs/);
});
