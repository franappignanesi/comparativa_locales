import { test } from "node:test";
import assert from "node:assert/strict";
import { pageMetadata, serializeJsonLd, SITE_URL } from "../src/lib/seo";
import { gameStructuredData, nativeOfferPrice } from "../src/lib/game-seo";
import type { NormalizedPrice } from "../src/lib/types";
import type { getGameSeoData } from "../src/lib/game-seo";

test("canonical and sharing metadata are absolute and unique", () => {
  const meta = pageMetadata("Biblioteca", "Descripción", "/biblioteca");
  assert.equal(meta.alternates?.canonical, `${SITE_URL}/biblioteca`);
  assert.equal(meta.openGraph?.title, "Biblioteca");
});
test("JSON-LD cannot close its script tag", () => {
  const value = { name: "</script><script>alert(1)</script>" };
  const serialized = serializeJsonLd(value);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), value);
});
test("game structured data never advertises stale prices", () => {
  const data = { game: { title: "Example", id: "example" }, offers: [
    { store: "steam", price: { finalPrice: 10, currency: "USD", url: "https://store.steampowered.com/", isStale: false } },
    { store: "microsoft", price: { finalPrice: 200, currency: "ARS", url: "https://www.xbox.com/", isStale: true } }
  ] } as NonNullable<Awaited<ReturnType<typeof getGameSeoData>>>;
  const schema = gameStructuredData(data);
  assert.equal(schema.offers.length, 1);
  assert.equal(schema.offers[0].priceCurrency, "USD");
});
test("game pages use native store prices, not ITAD's converted ARS payload", () => {
  const price = nativeOfferPrice({ currency: "ARS", finalPrice: 40981, originalCurrency: "USD", originalFinalPrice: 29.06 } as NormalizedPrice);
  assert.equal(price.currency, "USD");
  assert.equal(price.finalPrice, 29.06);
});
