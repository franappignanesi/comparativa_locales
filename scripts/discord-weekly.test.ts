import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiscordWeeklyMessage } from "../src/lib/discord-weekly-message";
import type { LatestPrices, NormalizedPrice, SampleGame, StoreId } from "../src/lib/types";
import type { WeekendGame } from "../src/lib/weekend-games";

function price(store: StoreId, amount: number, currency = "USD", usd = amount, discountPct = 0): NormalizedPrice {
  return { store, title: "Standard", available: true, basePrice: amount * 2, finalPrice: amount, currency, discountPct, url: "https://store.example/game", raw: null,
    originalCurrency: currency, originalFinalPrice: amount, originalBasePrice: amount * 2, usdFinalPrice: usd, usdBasePrice: usd * 2,
    arsConvertedFinalPrice: usd * 1500, arsConvertedBasePrice: usd * 3000, arsFinalPrice: usd * 1500, arsBasePrice: usd * 3000 };
}
function row(id: string, prices: LatestPrices["prices"][number]["prices"]): LatestPrices["prices"][number] {
  return { gameId: id, gameTitle: `Juego ${id}`, category: "AA", releaseYear: 2026, comparisonStatus: "missing_some_stores", prices };
}
function data(): LatestPrices {
  return { timestamp: new Date().toISOString(), usdToArs: 1500, prices: [
    row("jdf", { steam: price("steam", 30, "USD", 30, 25), microsoft: price("microsoft", 15000, "ARS", 10, 50) }),
    ...Array.from({ length: 6 }, (_, i) => row(`offer${i}`, { steam: price("steam", 5, "USD", 5, 80) })),
    ...Array.from({ length: 5 }, (_, i) => row(`bargain${i}`, { steam: price("steam", 40), microsoft: price("microsoft", 15000, "ARS", 10) }))
  ], errors: [] };
}
const weekend: WeekendGame = { steamAppId: 10, title: "JDF", coverUrl: "https://cdn.example/cover.jpg", videoUrl: "https://www.instagram.com/reel/abc/", reviewDate: "2026-09-27", reviewDateLabel: "", review: "", mentorUrl: "https://store.steampowered.com/curator/1" };
const catalog = [{ id: "jdf", identifiers: { steamAppId: 10 } }] as SampleGame[];
test("weekly hierarchy, native money, card links, image and nonrepeating sections", () => {
  const payload = buildDiscordWeeklyMessage(data(), catalog, [weekend], new Map(), new Set(["bargain0"]));
  const embeds = payload.embeds!;
  assert.equal(embeds.length, 3);
  assert.match(String(embeds[0].description), /USD 30,00 en Steam/);
  assert.match(String(embeds[0].description), /ARS 15.000,00 en Microsoft/);
  assert.match(String(embeds[0].description), /25% de descuento/);
  assert.match(String(embeds[0].description), /27\/09\/2026/);
  assert.ok(embeds[0].thumbnail);
  assert.equal((String(embeds[1].description).match(/OFF/g) ?? []).length, 5);
  assert.match(String(embeds[1].description), /biblioteca\?game=.*&query=.*&region=AR/);
  assert.equal(payload.bargainGameIds?.length, 3);
  assert.ok(!payload.bargainGameIds?.includes("bargain0"));
  assert.ok(!String(embeds[1].description).includes("game=jdf"));
});
test("missing conversions, stale prices, questionable editions and zero Steam are excluded", () => {
  const latest = data();
  latest.prices = latest.prices.filter((row) => row.gameId.startsWith("bargain"));
  latest.prices[0].prices.microsoft!.usdFinalPrice = null;
  latest.prices[1].prices.microsoft!.isStale = true;
  latest.prices[2].comparisonStatus = "edition_mismatch";
  latest.prices[3].prices.steam = price("steam", 0);
  latest.prices[4].prices.microsoft!.fetchedAt = "2020-01-01T00:00:00Z";
  const payload = buildDiscordWeeklyMessage(latest, [], [weekend], new Map(), new Set());
  assert.deepEqual(payload.bargainGameIds, []);
  assert.match(String(payload.embeds![2].description), /preferimos no repetir/);
});
test("long titles and IDs stay within Discord embed aggregate budget", () => {
  const latest = data();
  latest.prices.forEach((row) => { row.gameId += "界".repeat(150); row.gameTitle = "界".repeat(200); });
  const payload = buildDiscordWeeklyMessage(latest, [], [weekend], new Map(), new Set());
  let total = 0;
  for (const embed of payload.embeds!) {
    assert.ok(String(embed.description).length <= 4096);
    total += String(embed.title ?? "").length + String(embed.description ?? "").length + ((embed.footer as { text: string } | undefined)?.text.length ?? 0);
  }
  assert.ok(total <= 6000);
});
test("latest dated recommendation is chosen without mutating inputs", () => {
  const list = [{ ...weekend, title: "Old", reviewDate: "2023-01-01" }, weekend];
  const payload = buildDiscordWeeklyMessage(data(), catalog, list, new Map(), new Set());
  assert.ok(!String(payload.embeds![0].description).includes("Old"));
  assert.equal(list[0].title, "Old");
});
