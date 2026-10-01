import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverMicrosoftProduct, findMicrosoftPrice, hasMicrosoftPcPurchase, selectMicrosoftSearchResult } from "../src/lib/stores/microsoft";
import { applyDiscoveredMicrosoftGames } from "../src/lib/microsoft-discovery";
import { getGameSample } from "../src/lib/sample-builder";

function availability(price: number, platform: string, end = "2099-01-01") {
  return { Actions: ["Purchase"], Conditions: { StartDate: "2020-01-01", EndDate: end, ClientConditions: { AllowedPlatforms: [{ PlatformName: platform }] } }, OrderManagementData: { Price: { ListPrice: price, MSRP: 1399, CurrencyCode: "ARS" } } };
}
test("Microsoft takes active PC sale prices, not expired or console-only offers", () => {
  const product = { Availabilities: [availability(1399, "Windows.Desktop"), availability(139.9, "Windows.Desktop"), availability(1, "Windows.Xbox"), availability(50, "Windows.Desktop", "2020-01-02")] };
  assert.deepEqual(findMicrosoftPrice(product), { basePrice: 1399, finalPrice: 139.9, currency: "ARS" });
});
test("Microsoft console-only listings do not become PC prices", () => {
  assert.equal(findMicrosoftPrice({ Availabilities: [availability(139.9, "Windows.Xbox")] }), null);
});

test("annual standard editions match without accepting premium editions or DLC", () => {
  const results = [
    { ProductId: "premium", Title: "Sea of Thieves: 2026 Premium Edition", CardActions: ["Purchase"] },
    { ProductId: "dlc", Title: "Sea of Thieves: Pirate pack", CardActions: ["Purchase"] },
    { ProductId: "base", Title: "Sea of Thieves: 2026 Edition", CardActions: ["Purchase"] }
  ];
  assert.equal(selectMicrosoftSearchResult({ title: "Sea of Thieves" }, results)?.ProductId, "base");
  assert.equal(selectMicrosoftSearchResult({ title: "Sea of Thieves" }, results.slice(0, 2)), null);
});

test("PC suffixes match and automatic discovery requires explicit PC purchase", () => {
  assert.equal(selectMicrosoftSearchResult({ title: "Injustice 2" }, [{ ProductId: "pc", Title: "Injustice 2 Standard Edition for Windows", CardActions: ["Purchase"] }])?.ProductId, "pc");
  const catalog = (packagePlatform: string, purchasePlatform: string) => ({ ProductType: "Game", DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [{ PlatformDependencies: [{ PlatformName: packagePlatform }] }] } }, Availabilities: [availability(100, purchasePlatform)] }] });
  assert.equal(hasMicrosoftPcPurchase(catalog("Windows.Xbox", "Windows.Desktop")), false);
  assert.equal(hasMicrosoftPcPurchase(catalog("Windows.Desktop", "Windows.Xbox")), false);
  assert.equal(hasMicrosoftPcPurchase(catalog("Windows.Desktop", "Windows.Desktop")), true);
  assert.equal(hasMicrosoftPcPurchase({ Availabilities: [{ Actions: ["Purchase"] }] }), false);
  assert.equal(selectMicrosoftSearchResult({ title: "Alan Wake Remastered" }, [{ ProductId: "wrong", Title: "Alan Wake", CardActions: ["Purchase"] }]), null);
});

test("discovery expands Steam-only coverage but preserves explicit manual identifiers", async () => {
  const sample = await getGameSample();
  const original = sample.broadSample[0];
  const game = { ...original, expectedStores: ["steam" as const], availableStores: ["steam" as const], missingStores: ["microsoft" as const], identifiers: { steamAppId: original.identifiers.steamAppId } };
  const partial = { ...sample, broadSample: [game] };
  const state = { matches: { [game.id]: "9P2N57MC619K" }, checkedAt: {} };
  const updated = applyDiscoveredMicrosoftGames(partial, state);
  assert.equal(updated.broadSample[0].identifiers.microsoftProductId, "9P2N57MC619K");
  assert.ok(updated.broadSample[0].availableStores.includes("microsoft"));
  assert.ok(!updated.broadSample[0].missingStores.includes("microsoft"));
  const manual = { ...game, identifiers: { ...game.identifiers, microsoftProductId: "MANUAL" } };
  assert.equal(applyDiscoveredMicrosoftGames({ ...partial, broadSample: [manual] }, state).broadSample[0].identifiers.microsoftProductId, "MANUAL");
});

test("discovery does not silently turn upstream failures into missing products", async () => {
  const game = (await getGameSample()).broadSample[0];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(discoverMicrosoftProduct(game), /Microsoft search HTTP 503/);
  } finally { globalThis.fetch = originalFetch; }
});

test("Microsoft discovery state survives every daily artifact and cache handoff", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(".github/workflows/daily-price-refresh.yml", "utf8");
  assert.equal((workflow.match(/data\/generated\/microsoft-discovery\.json/g) ?? []).length, 3);
  assert.ok(workflow.includes("restore-keys: barateam-microsoft-discovery-"));
  const publicCacheBlocks = workflow.split(/\r?\n      - /).filter((block) => block.includes("uses: actions/cache/") && block.includes("key: barateam-public-data-"));
  assert.equal(publicCacheBlocks.length, 3);
  assert.ok(publicCacheBlocks.every((block) => !block.includes("microsoft-discovery.json")));
  assert.ok(workflow.includes("npx tsx scripts/discover-microsoft-games.ts"));
  assert.ok(workflow.includes("MICROSOFT_DISCOVERY_LIMIT: ${{ inputs.microsoft_catalog_audit && '10000' || '150' }}"));
  assert.ok(workflow.includes("inputs.microsoft_catalog_audit && 'npm run refresh:microsoft-prices'"));
});
