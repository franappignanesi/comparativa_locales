import assert from "node:assert/strict";
import { test } from "node:test";
import additions from "../data/autumn-catalog-additions.json";
import { AUTUMN_SELECTION, steamIdentity, steamOfferDiscount, steamOfferScore, steamAtHistoricalLow } from "../src/lib/autumn-offers";
import { withSeasonalGames } from "../src/lib/sample-builder";
import { parseSteamBundle } from "../src/lib/stores/steam-bundle";
import { REGIONS } from "../src/lib/regions";
import type { GameSample, HistoricalLow, LatestPrices, SampleGame } from "../src/lib/types";

const row = (amount = 25) => ({ gameId: "test", gameTitle: "Test", prices: { steam: { available: true, originalCurrency: "USD", originalFinalPrice: amount, originalBasePrice: 50, arsFinalPrice: amount * 1000, discountPct: 50 }, epic: { available: true, discountPct: 99 } } }) as LatestPrices["prices"][number];
const low = { originalCurrency: "USD", originalFinalPrice: 25 } as HistoricalLow;

test("Steam discounts ignore other stores, invalid prices and stale offers", () => {
  assert.equal(steamOfferDiscount(row()), 50);
  assert.equal(steamOfferDiscount(row(0)), 0);
  assert.equal(steamOfferDiscount({ ...row(), prices: { steam: { ...row().prices.steam!, isStale: true } } }), 0);
});

test("ranking balances relevance and Steam all-time lows without mixing currencies", () => {
  const popular = { notes: "Reviews: 100000. Positive: 95%.", identifiers: {} } as SampleGame;
  const niche = { notes: "Reviews: 100.", identifiers: {} } as SampleGame;
  assert.ok(steamOfferScore(row(), popular, undefined) > steamOfferScore(row(), niche, low));
  assert.ok(steamOfferScore(row(), popular, low) > steamOfferScore(row(), popular, undefined));
  assert.equal(steamAtHistoricalLow(row(), { ...low, originalCurrency: "ARS" }), false);
  assert.equal(steamAtHistoricalLow(row(26), low), false);
  assert.equal(steamAtHistoricalLow(row(24), low), true);
});

test("all 26 selected identities resolve alongside existing games and additions are idempotent", () => {
  const existing = AUTUMN_SELECTION.filter(item => !additions.some(game => steamIdentity(game.identifiers) === steamIdentity(item)))
    .map<SampleGame>((item, index) => ({ id: `existing-${index}`, title: item.title, identifiers: item, availableStores: ["steam"], missingStores: ["epic", "gog", "humble", "microsoft"], notes: "", edition: "standard", category: "AA", releaseYear: 2025, expectedStores: ["steam"], confidence: "high", comparisonStatus: "missing_some_stores" }));
  const sample: GameSample = { timestamp: "2026-10-01", broadSample: existing, strictSample: [], rejected: [], missingByStore: {}, storeCoverage: {}, categoryCoverage: {} };
  const updated = withSeasonalGames(sample);
  assert.equal(AUTUMN_SELECTION.length, 26);
  assert.equal(new Set(AUTUMN_SELECTION.map(steamIdentity)).size, 26);
  assert.deepEqual(AUTUMN_SELECTION.filter(item => !updated.broadSample.some(game => steamIdentity(game.identifiers) === steamIdentity(item))), []);
  assert.equal(withSeasonalGames(updated).broadSample.length, updated.broadSample.length);
  assert.equal(sample.broadSample.length, 18);
});

test("bundle extraction uses its own purchase block, not a discounted included game", () => {
  const game = { id: "bundle", title: "Bundle", identifiers: { steamBundleId: 14936 } } as SampleGame;
  const html = `<div class="discount_block" data-price-final="99999"></div><div class="game_area_purchase_game" data-ds-bundleid="14936" data-ds-bundle-data='{"m_rgItems":[{"m_nBasePriceInCents":3000},{"m_nBasePriceInCents":2000}]}'><div class="game_purchase_discount" data-price-final="500"></div></div>`;
  const price = parseSteamBundle(game, html, REGIONS[0]);
  assert.equal(price.finalPrice, 5);
  assert.equal(price.basePrice, 50);
  assert.equal(price.discountPct, 90);
  assert.equal(price.currency, "USD");
  assert.equal(parseSteamBundle(game, html, REGIONS[1]).currency, "MXN");
  assert.throws(() => parseSteamBundle(game, '<div data-price-final="500"></div>'));
  assert.throws(() => parseSteamBundle(game, html.replace('data-price-final="500"', 'data-price-final="9000"')));
});
