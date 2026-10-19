import assert from "node:assert/strict";
import test from "node:test";
import { fetchStorePrices } from "../src/lib/stores/steam";
import type { SampleGame } from "../src/lib/types";

test("Steam batches use the supported price-only filter, avoiding HTTP 400 and single-request storms", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      calls.push(url.toString());
      assert.equal(url.searchParams.get("filters"), "price_overview");
      return Response.json(Object.fromEntries(url.searchParams.get("appids")!.split(",").map(id => [id, { success: true, data: { price_overview: { initial: 499, final: 399, currency: "USD", discount_percent: 20 } } }])));
    };
    const games = [1551360, 2483190, 2121510].map(id => ({ id: String(id), title: String(id), identifiers: { steamAppId: id } } as SampleGame));
    const prices = await fetchStorePrices(games, 25);
    assert.equal(calls.length, 1);
    assert.equal(prices.size, 3);
    assert.equal(prices.get("2121510")?.finalPrice, 3.99);
  } finally { globalThis.fetch = original; }
});
