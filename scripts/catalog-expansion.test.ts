import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCatalogAdditions, catalogIdentity, EXCLUDED_PRODUCT, isPackTitle } from "../src/lib/catalog-expansion";
import { lookupItadIds } from "../src/lib/itad";
import type { GameCandidate } from "../src/lib/types";

function game(id: number, pack = false, comparable = false): GameCandidate {
  return { title: `Title ${id}`, edition: "standard", category: "AA", releaseYear: 2020, notes: "", confidence: "high", productKind: pack ? "pack" : "game", expectedStores: comparable ? ["steam", "gog"] : ["steam"], identifiers: { ...(pack ? { steamSubId: id } : { steamAppId: id }), itadId: `id-${id}` } };
}
test("package identities never collide with app IDs", () => {
  assert.notEqual(catalogIdentity(game(1)), catalogIdentity(game(1, true)));
});
test("does not add duplicates, unverified identities or DLC", () => {
  const unverified = game(2); delete unverified.identifiers.itadId;
  assert.deepEqual(chooseCatalogAdditions([game(1), unverified, { ...game(3), title: "Game DLC" }], [game(1)], 100), []);
  assert.equal(EXCLUDED_PRODUCT.test("Game 4-pack"), true);
});
test("pack coverage floor survives each batch and limit", () => {
  const candidates = [...Array.from({ length: 10 }, (_, i) => game(i + 1, true, i < 7)), game(100)];
  const selected = chooseCatalogAdditions(candidates.reverse(), [], 10);
  const packs = selected.filter(g => g.productKind === "pack");
  assert.ok(packs.filter(g => g.expectedStores.length > 1).length / packs.length >= 0.7);
  assert.equal(chooseCatalogAdditions(candidates, [], 0).length, 0);
  assert.equal(chooseCatalogAdditions(candidates, [], 3).length, 3);
});
test("caps curated packs at 150 and preserves input", () => {
  const existing = Array.from({ length: 150 }, (_, i) => game(i, true, true));
  const next = game(1000, true, true);
  assert.deepEqual(chooseCatalogAdditions([next, game(1001)], existing, 20), [game(1001)]);
  assert.equal(next.productKind, "pack");
});
test("collection members and unrelated titles are not packs", () => {
  assert.equal(isPackTitle("NINJA GAIDEN 2 [NINJA GAIDEN: Master Collection]"), false);
  assert.equal(isPackTitle("Metal Gear Solid 4 - Master Collection Version"), false);
  assert.equal(isPackTitle("BioShock: The Collection"), true);
});
test("pack prices use verified identity and never a base-game title lookup", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.deepEqual(JSON.parse(String(init?.body)), ["Base game"]);
    return new Response(JSON.stringify({ "Base game": "base-id" }), { status: 200 });
  };
  try {
    const result = await lookupItadIds([
      { title: "Collection", identifiers: { steamSubId: 1, itadId: "pack-id" }, productKind: "pack" },
      { title: "Unverified pack", productKind: "pack" },
      { title: "Base game" }
    ], "test-key", []);
    assert.deepEqual(result, { "Base game": "base-id", Collection: "pack-id" });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test("packs cannot fall through to guessed store slugs or Microsoft automatic matching", async () => {
  const { readFile } = await import("node:fs/promises");
  const prices = await readFile("src/lib/prices.ts", "utf8");
  assert.ok(prices.indexOf('game.productKind === "pack" && store !== "steam"') < prices.indexOf('if (!game.availableStores.includes(store))'));
  assert.ok((await readFile("scripts/discover-microsoft-games.ts", "utf8")).includes('game.productKind !== "pack"'));
});
