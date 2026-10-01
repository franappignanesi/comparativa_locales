import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeReleaseCandidates, parseSteamSearchResults } from "../src/lib/release-automation";
import { withManualStoreMatches, withSourceCandidates, getGameSample } from "../src/lib/sample-builder";
import type { GameSample } from "../src/lib/types";

test("discovery keeps titles attached to their Steam app IDs and excludes bundles", () => {
  const rows = parseSteamSearchResults('<a class="search_result_row" data-ds-appid="4080220"><span class="title">EA SPORTS FC&#8482; 27</span></a><a class="search_result_row" data-ds-appid="1,2"><span class="title">Bundle</span></a><a class="search_result_row" data-ds-appid="123"><span class="title">A &amp; B</span></a>', "topsellers");
  assert.deepEqual(rows.map((row) => [row.appId, row.title]), [[4080220, "EA SPORTS FC™ 27"], [123, "A & B"]]);
});

test("rebuilding discovery preserves published games absent from the Git source", async () => {
  const sample = await getGameSample();
  const game = sample.broadSample[0];
  assert.equal(mergeReleaseCandidates([], [game]).length, 1);
  assert.equal(mergeReleaseCandidates([game], [game]).length, 1);
});

test("Microsoft mappings apply even when a deployment restores an older sample", async () => {
  const sample = await getGameSample();
  const titles = ["Kingdom Come: Deliverance II", "Visage", "Injustice 2"];
  const stale: GameSample = { ...sample, broadSample: sample.broadSample.filter((game) => titles.includes(game.title)).map((game) => ({ ...game, expectedStores: ["steam"], availableStores: ["steam"], identifiers: { steamAppId: game.identifiers.steamAppId } })) };
  const fixed = withManualStoreMatches(stale);
  assert.equal(fixed.broadSample.length, 3);
  assert.ok(fixed.broadSample.every((game) => game.availableStores.includes("microsoft") && game.identifiers.microsoftProductId));
});

test("catalog artifact downloads use the data root in both consumers", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(".github/workflows/daily-price-refresh.yml", "utf8");
  assert.equal((workflow.match(/name: catalog-state\r?\n\s+path: data/g) ?? []).length, 2);
});

test("new source games survive older deployment caches", async () => {
  const sample = await getGameSample();
  const stale = { ...sample, broadSample: sample.broadSample.filter((game) => game.identifiers.steamAppId !== 4080220) };
  const restored = withSourceCandidates(stale);
  assert.ok(restored.broadSample.some((game) => game.identifiers.steamAppId === 4080220));
  assert.equal(withSourceCandidates(restored).broadSample.length, restored.broadSample.length);
});
