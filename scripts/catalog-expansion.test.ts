import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCatalogAdditions, catalogIdentity, EXCLUDED_PRODUCT, isPackTitle, normalizedCatalogTitle } from "../src/lib/catalog-expansion";
import { lookupItadIds } from "../src/lib/itad";
import type { GameCandidate } from "../src/lib/types";

function game(id: number, pack = false, comparable = false): GameCandidate {
  return { title: `Title ${id}`, edition: "standard", category: "AA", releaseYear: 2020, notes: "", confidence: "high", productKind: pack ? "pack" : "game", expectedStores: comparable ? ["steam", "gog"] : ["steam"], identifiers: { ...(pack ? { steamSubId: id } : { steamAppId: id }), itadId: `id-${id}` } };
}
test("package identities never collide with app IDs", () => {
  assert.notEqual(catalogIdentity(game(1)), catalogIdentity(game(1, true)));
});
test("trademark symbols do not create duplicate collection cards", () => {
  assert.equal(normalizedCatalogTitle("Command & Conquer™ Remastered Collection"), normalizedCatalogTitle("Command & Conquer Remastered Collection"));
});

test("different identities cannot overwrite the same public card slug", () => {
  const first = { ...game(1), title: "Seek Girl \u2161" };
  const second = { ...game(2), title: "Seek Girl \u2163" };
  assert.deepEqual(chooseCatalogAdditions([first, second], [], 10), [first]);
  assert.deepEqual(chooseCatalogAdditions([second], [first], 10), []);
  assert.deepEqual(chooseCatalogAdditions([{ ...game(3), title: "\u4e2d\u6587" }], [], 10), []);
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

test("every public dataset cache uses identical paths for save and restore", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { load } = createRequire(import.meta.url)("js-yaml");
  const paths: string[] = [];
  for (const file of ["daily-price-refresh", "deploy-production", "discord-weekly", "steam-sale-refresh", "discord-dm-trial"]) {
    const workflow = load(await readFile(`.github/workflows/${file}.yml`, "utf8")) as { jobs: Record<string, { steps: Array<{ uses?: string; with?: { key?: string; path?: string } }> }> };
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses?.startsWith("actions/cache/") && (step.with?.key?.startsWith("barateam-public-data-") || step.with?.key?.includes("inputs.history_recovery_cache")));
    assert.ok(steps.length, `Public cache missing in ${file}`);
    for (const step of steps) {
      const path = step.with!.path!.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join("\n");
      if ((step as { id?: string }).id === "legacy-history-recovery") {
        assert.equal(path.split("\n").length, 8);
        assert.ok(!path.includes("data/generated/catalog-expansion.json"));
        continue;
      }
      paths.push(path);
    }
  }
  assert.equal(paths.length, 11);
  assert.equal(new Set(paths).size, 1, "Different cache paths create incompatible GitHub cache versions and restore old data");
  assert.ok(paths[0].includes("data/generated/catalog-expansion.json"));
});

test("Steam sale publishing restores the catalog before merging regional artifacts", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { load } = createRequire(import.meta.url)("js-yaml");
  const workflow = load(await readFile(".github/workflows/steam-sale-refresh.yml", "utf8"));
  const steps = workflow.jobs["publish-production"].steps as Array<{ id?: string; uses?: string }>;
  const restore = steps.findIndex(step => step.id === "public-data");
  const merge = steps.findIndex(step => step.uses?.startsWith("actions/download-artifact@"));
  assert.ok(restore > 0 && restore < merge);
  const worker = await readFile("scripts/steam-sale-refresh-worker.ts", "utf8");
  assert.ok(worker.includes("game.identifiers.steamAppId || game.identifiers.steamSubId"));
});
