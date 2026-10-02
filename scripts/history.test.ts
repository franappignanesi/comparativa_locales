import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { readJson } from "../src/lib/cache";
import { compactOwnHistory, gameIdsMissingHistory } from "../src/lib/history";
import { historyChartObservations } from "../src/lib/history-chart";
import type { PriceHistoryEntry } from "../src/lib/types";

const entry = (timestamp: string, price: number): PriceHistoryEntry => ({ gameId: "test", store: "steam", timestamp, originalCurrency: "USD", originalFinalPrice: price, originalBasePrice: 50, arsFinalPrice: price * 1000, arsBasePrice: 50000, discountPct: 0, source: "snapshot" });

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
