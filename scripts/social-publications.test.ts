import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "../src/app/api/admin/publications/route";
import { setSessionCookie } from "../src/lib/auth-session";
import { buildPublicationGame, publicationAssetUrl, publicationCaption, publicationMoney } from "../src/lib/social-publications";
import type { HistoricalLow, LatestPrices, NormalizedPrice } from "../src/lib/types";

const now = Date.parse("2026-10-02T12:00:00Z");
const price = { available: true, originalFinalPrice: 10, originalBasePrice: 20, originalCurrency: "USD", arsFinalPrice: 15000, fetchedAt: "2026-10-02T11:00:00Z" } as NormalizedPrice;
const row = { gameId: "test", gameTitle: "Juego", coverUrl: "https://shared.akamai.steamstatic.com/header.jpg", prices: { steam: price, microsoft: { ...price, originalFinalPrice: 10000, originalBasePrice: 10000, originalCurrency: "ARS", arsFinalPrice: 10000 } } } as LatestPrices["prices"][number];
const latest = { timestamp: "2026-10-02T11:00:00Z", prices: [row] } as LatestPrices;
const low = { originalCurrency: "USD", originalFinalPrice: 10 } as HistoricalLow;

test("publications use native currency, real base discounts and matching-currency historical lows", () => {
  const game = buildPublicationGame(row, latest, { steam: low, microsoft: low }, "AR", now);
  const steam = game.prices.find(price => price.store === "steam")!;
  const xbox = game.prices.find(price => price.store === "microsoft")!;
  assert.equal(publicationMoney(steam), "USD 10");
  assert.equal(publicationMoney(xbox), "ARS 10.000");
  assert.equal(steam.discount, 50);
  assert.equal(steam.historicalLow, true);
  assert.equal(xbox.historicalLow, false);
  assert.equal(xbox.cheapest, true);
  assert.equal(steam.cheapest, false);
  const caption = publicationCaption([{ game, headline: "Elegido", description: "Descripción" }], "Selección");
  assert.match(caption, /Elegido · Argentina/);
  assert.match(caption, /https:\/\/www.shuxteam.com\/juegos\/test/);
  assert.match(caption, /02\/10\/2026|2\/10\/2026/);
});

test("stale, unavailable and wrong-currency prices do not become promo claims", () => {
  const staleRow = { ...row, prices: { steam: { ...price, fetchedAt: "2026-09-01T00:00:00Z" }, epic: { ...price, available: false } } };
  const game = buildPublicationGame(staleRow, latest, { steam: low }, "AR", now);
  assert.equal(game.prices[0].stale, true);
  assert.equal(game.prices[0].discount, 0);
  assert.equal(game.prices[0].historicalLow, false);
  assert.equal(game.prices[0].cheapest, false);
  assert.equal(game.prices[1].amount, null);
  const free = buildPublicationGame({ ...row, prices: { steam: { ...price, originalFinalPrice: 0, arsFinalPrice: 0 } } }, latest, {}, "AR", now);
  assert.equal(free.prices[0].discount, 100);
  const reported = buildPublicationGame({ ...row, prices: { steam: { ...price, originalBasePrice: null, discountPct: 75 } } }, latest, {}, "AR", now);
  assert.equal(reported.prices[0].discount, 75);
});

test("publication assets cannot proxy arbitrary URLs, SVG, credentials or ports", () => {
  assert.ok(publicationAssetUrl("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/header.jpg?t=1"));
  for (const value of ["http://shared.akamai.steamstatic.com/a.jpg", "https://evil.example/a.jpg", "https://shared.akamai.steamstatic.com.evil.example/a.jpg", "https://shared.akamai.steamstatic.com:444/a.jpg", "https://u:p@shared.akamai.steamstatic.com/a.jpg", "https://shared.akamai.steamstatic.com/a.svg", "file:///secret.png"]) assert.equal(publicationAssetUrl(value), null);
});

test("publications and image proxy require server-side admin authority", async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-session-secret-at-least-32-characters";
  try {
    for (const path of ["", "?asset=1&gameId=test", "?email=franappignanesi@gmail.com"]) {
      assert.equal((await GET(new NextRequest(`https://www.shuxteam.com/api/admin/publications${path}`))).status, 401);
    }
    const response = NextResponse.json({});
    setSessionCookie(response, { sub: "test", email: "not-admin@example.invalid", name: "Test" });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await GET(new NextRequest("https://www.shuxteam.com/api/admin/publications?asset=1", { headers: { cookie } }))).status, 403);
  } finally {
    if (previous == null) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous;
  }
});
