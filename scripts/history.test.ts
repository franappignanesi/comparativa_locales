import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { readJson } from "../src/lib/cache";
import { compactOwnHistory, gameIdsMissingHistory, isFullHistoryCacheFresh, fullHistoryGameIdsToRefresh } from "../src/lib/history";
import { historyChartObservations } from "../src/lib/history-chart";
import { steamAppIdFromUrl } from "../src/lib/itad";
import { mergeFullHistoryArchive, type FullHistoryArchive } from "../src/lib/history-backfill";
import type { PriceHistoryEntry } from "../src/lib/types";

const entry = (timestamp: string, price: number): PriceHistoryEntry => ({ gameId: "test", store: "steam", timestamp, originalCurrency: "USD", originalFinalPrice: price, originalBasePrice: 50, arsFinalPrice: price * 1000, arsBasePrice: 50000, discountPct: 0, source: "snapshot" });

test("chart collapses daily repetitions without losing sale transitions or latest observation", () => {
  const prices = [50, 50, 50, 25, 25, 25, 50];
  const observations = prices.map((price, index) => entry(`2026-10-0${index + 1}T12:00:00Z`, price));
  const chart = historyChartObservations(observations, new Date("2026-10-01"), new Date("2026-10-08"));
  assert.deepEqual(chart.map(point => point.timestamp), [observations[0], observations[2], observations[3], observations[5], observations[6]].map(point => point.timestamp));
  assert.equal(observations.length, 7);
});

test("chart compression is per store and retains both ends of constant series", () => {
  const observations = [1, 2, 3, 4].flatMap(day => [entry(`2026-10-0${day}T12:00:00Z`, 50), { ...entry(`2026-10-0${day}T13:00:00Z`, day === 3 ? 30 : 50), store: "epic" as const }]);
  const chart = historyChartObservations(observations, new Date("2026-10-01"), new Date("2026-10-05"));
  assert.equal(chart.filter(point => point.store === "steam").length, 2);
  assert.equal(chart.filter(point => point.store === "epic").length, 4);
});

test("incremental imports retain prior series and other games, with durable progress", () => {
  const before = entry("2026-06-01T12:00:00Z", 50);
  const after = entry("2026-10-01T12:00:00Z", 25);
  const current: FullHistoryArchive = { timestamp: null, enabled: true, source: "test", matchedGames: 1, errors: [], entries: [before], checkedGames: { other: "2026-09-30T12:00:00Z" } };
  const merged = mergeFullHistoryArchive(current, { ...current, entries: [before, after], checkedGames: { test: "2026-10-01T12:00:00Z" } });
  assert.deepEqual(merged.entries, [before, after]);
  assert.deepEqual(Object.keys(merged.checkedGames!).sort(), ["other", "test"]);
});

test("refreshing one game cannot make another game's old history look fresh", () => {
  const now = new Date().toISOString();
  const cached: FullHistoryArchive = { timestamp: now, enabled: true, source: "test", matchedGames: 1, errors: [], entries: [entry("2026-06-01T12:00:00Z", 50), entry("2026-09-01T12:00:00Z", 25)], checkedGames: { other: now, test: "2026-06-01T12:00:00Z" } };
  assert.deepEqual([...fullHistoryGameIdsToRefresh(cached, new Set(["test"]))], ["test"]);
});

test("an old full-history cache cannot suppress newly available observations", () => {
  assert.equal(isFullHistoryCacheFresh(new Date(Date.now() - 1000).toISOString()), true);
  assert.equal(isFullHistoryCacheFresh(new Date(Date.now() - 2 * 86400000).toISOString()), false);
  assert.equal(isFullHistoryCacheFresh(null), false);
});

test("missing historical identities use the exact Steam application, never a pack or another domain", () => {
  assert.equal(steamAppIdFromUrl("https://store.steampowered.com/app/1237970/Titanfall_2/"), 1237970);
  assert.equal(steamAppIdFromUrl("https://store.steampowered.com/bundle/72233/"), null);
  assert.equal(steamAppIdFromUrl("https://example.com/app/1237970/"), null);
});

test("prices across several stores on one day are not a complete historical series", () => {
  const sameDay = [entry("2026-10-01T10:00:00Z", 50), { ...entry("2026-10-01T12:00:00Z", 40), store: "epic" as const }];
  assert.deepEqual([...gameIdsMissingHistory(sameDay, new Set(["test"]))], ["test"]);
  assert.equal(gameIdsMissingHistory([...sameDay, entry("2026-09-01T10:00:00Z", 60)], new Set(["test"])).size, 0);
  const low = { ...entry("2026-06-01T10:00:00Z", 20), kind: "historical_low" as const };
  assert.equal(gameIdsMissingHistory([...sameDay, low], new Set(["test"])).size, 1);
});

test("a checked-in old JSON cannot hide newer compressed history; fresh writes still win", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "barateam-history-"));
  const file = path.join(folder, "price-history.json");
  try {
    await fs.writeFile(file, JSON.stringify({ timestamp: "2026-06-01T00:00:00Z", entries: ["old"] }));
    await fs.writeFile(`${file}.gz`, gzipSync(JSON.stringify({ timestamp: "2026-10-01T12:00:00Z", entries: ["new"] })));
    assert.deepEqual((await readJson<{ entries: string[] }>(file, { entries: [] })).entries, ["new"]);
    await fs.writeFile(file, JSON.stringify({ timestamp: "2026-10-01T18:00:00Z", entries: ["fresh"] }));
    assert.deepEqual((await readJson<{ entries: string[] }>(file, { entries: [] })).entries, ["fresh"]);
    await fs.writeFile(file, "broken");
    assert.deepEqual((await readJson<{ entries: string[] }>(file, { entries: [] })).entries, ["new"]);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("daily compaction retains the real pre-sale price and subsequent discount on the same day", () => {
  const day = new Date().toISOString().slice(0, 10);
  const full = entry(`${day}T10:00:00Z`, 50);
  const discounted = entry(`${day}T18:00:00Z`, 25);
  const repeat = entry(`${day}T20:00:00Z`, 25);
  const compact = compactOwnHistory([full, discounted, repeat]);
  assert.deepEqual(compact.map(e => e.originalFinalPrice), [50, 25]);
  assert.equal(compact[1].timestamp, repeat.timestamp);
});

test("historical lows never become a continuous chart series and no monthly prices are invented", () => {
  const before = entry("2026-09-30T12:00:00Z", 50);
  const after = entry("2026-10-01T18:00:00Z", 25);
  const low = { ...entry("2026-04-01T12:00:00Z", 20), kind: "historical_low" as const, source: "itad" as const };
  assert.deepEqual(historyChartObservations([low, after, before], new Date("2026-04-01"), new Date("2026-10-02")), [before, after]);
});
