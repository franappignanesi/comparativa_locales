import assert from "node:assert/strict";
import { test } from "node:test";
import { argentinaDate, buildDiscordWishlistMessage, discordAlertSignature, discordText, discordWeek } from "../src/lib/discord-messages";
import { boundedDiscordSetting, discordRecipientAllowed, discordSameOrigin, discordSendsEnabled, discordWebhookUrl } from "../src/lib/discord-config";
import { DiscordApiError, discordRequest, discordWeeklyBudget, resetDiscordBudget, sendDiscordDm, sendDiscordWebhook } from "../src/lib/discord-api";
import { discordTestFailure } from "../src/lib/discord-test-errors";
import type { WishlistAlert } from "../src/lib/wishlist-alerts";
import { discordDmConsentValid, discordDmOffersValid } from "../src/lib/discord-dm-validation";
import type { DiscordJob } from "../src/lib/discord-store";
import { DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_WISHLIST_PREFERENCES, type StoredWishlistItem } from "../src/lib/user-store";
import type { LatestPrices } from "../src/lib/types";

test("queued DMs recheck consent, unlinking, region, stores, conditions and current price", () => {
  const job = { recipient: "123456789012345678", payload: { region: "AR", prices: [{ gameId: "game", store: "steam", currency: "USD", price: 10, type: "price_drop" }] } } as DiscordJob;
  const link = { discordId: job.recipient, username: "test", verified: true };
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, discord: true, preferredRegion: "AR" as const, enabledStores: ["steam" as const] };
  assert.equal(discordDmConsentValid(job, link, settings, true), true);
  assert.equal(discordDmConsentValid(job, null, settings, true), false);
  assert.equal(discordDmConsentValid(job, { ...link, verified: false }, settings, true), false);
  assert.equal(discordDmConsentValid(job, link, { ...settings, discord: false }, true), false);
  assert.equal(discordDmConsentValid(job, link, { ...settings, preferredRegion: "MX" }, true), false);
  assert.equal(discordDmConsentValid(job, link, settings, false), false);
  const item = { gameId: "game", notificationEnabled: true, notificationPreferences: { ...DEFAULT_WISHLIST_PREFERENCES, priceDrop: true } } as StoredWishlistItem;
  const latest = { timestamp: new Date().toISOString(), prices: [{ gameId: "game", prices: { steam: { available: true, finalPrice: 10, currency: "USD", fetchedAt: new Date().toISOString() } } }] } as LatestPrices;
  assert.equal(discordDmOffersValid(job, settings, [item], latest), true);
  assert.equal(discordDmOffersValid(job, settings, [], latest), false);
  assert.equal(discordDmOffersValid(job, settings, [{ ...item, notificationEnabled: false }], latest), false);
  assert.equal(discordDmOffersValid(job, settings, [{ ...item, notificationPreferences: { ...item.notificationPreferences, priceDrop: false } }], latest), false);
  assert.equal(discordDmOffersValid(job, { ...settings, enabledStores: [] }, [item], latest), false);
  assert.equal(discordDmOffersValid({ ...job, payload: { ...job.payload, prices: [{ ...job.payload.prices![0], price: 9 }] } }, settings, [item], latest), false);
  assert.equal(discordDmOffersValid({ ...job, payload: { region: "AR", prices: [] } }, settings, [item], latest), false);
});

const alert: WishlistAlert = { userId: "private-user", region: "AR", gameId: "game", gameTitle: "Juego @everyone", store: "steam", type: "price_drop", message: "Bajó 50%", triggeredAt: "2026-10-01T00:00:00Z", currentOfficialPrice: 10, currentCurrency: "USD", currentArsPrice: 10000 };
test("manual weekly trials have a separate bounded budget from scheduled sends", () => {
  assert.deepEqual(discordWeeklyBudget(false), { key: "weekly-global", limit: 2, reason: "weekly_daily_limit" });
  assert.deepEqual(discordWeeklyBudget(true), { key: "weekly-test-global", limit: 3, reason: "weekly_test_daily_limit" });
});
test("webhook URLs accept Discord variants but reject unrelated targets", () => {
  const path = "/api/webhooks/123456789012345678/test_token";
  assert.equal(discordWebhookUrl(` https://discord.com${path}\n`)?.search, "?wait=true");
  assert.equal(discordWebhookUrl(`https://discordapp.com${path}/?wait=false`)?.search, "?wait=true");
  for (const url of [`https://evil.example${path}`, `https://discord.com.evil.example${path}`, `https://discord.com@evil.example${path}`, `http://discord.com${path}`, `https://discord.com:444${path}`, `https://discord.com${path}?other=1`, "https://discord.gg/NF88UabRc", "test_token", `https://discord.com${path}#fragment`]) assert.equal(discordWebhookUrl(url), null);
});
test("confirmation errors distinguish configuration, allowlist, privacy and uncertain delivery", () => {
  assert.match(discordTestFailure(new DiscordApiError(401)).error, /problema del servicio/);
  assert.equal(discordTestFailure(new DiscordApiError(403, 0, false, undefined, "recipient_not_allowed")).status, 403);
  assert.match(discordTestFailure(new DiscordApiError(403, 0, false, 50007)).error, /mensajes directos/);
  assert.match(discordTestFailure(new DiscordApiError(0, 0, true)).error, /no repitas/);
  assert.match(discordTestFailure(new Error("database failure"), true).error, /guardar la verificación/);
});
test("Discord text neutralizes mentions and markdown", () => {
  const value = discordText("@everyone **hello** [link](https://evil.example) <@123>");
  assert.ok(!value.includes("@") && !value.includes("[") && !value.includes("<") && !value.includes("*"));
  assert.equal(discordText("x".repeat(1000)).length, 180);
});
test("one message contains no more than ten unique game/store offers or identity", () => {
  const payload = buildDiscordWishlistMessage(Array.from({ length: 30 }, (_, index) => ({ ...alert, gameId: `game-${index % 15}` })));
  assert.equal(payload.signatures?.length, 10);
  assert.equal(payload.prices?.length, 10);
  assert.ok(JSON.stringify(payload).length < 6000);
  assert.ok(!JSON.stringify(payload).includes("private-user"));
});
test("delivery signature survives repeat runs but changes with price or region", () => {
  assert.equal(discordAlertSignature(alert), discordAlertSignature({ ...alert, triggeredAt: "other-day" }));
  assert.notEqual(discordAlertSignature(alert), discordAlertSignature({ ...alert, currentOfficialPrice: 9 }));
  assert.notEqual(discordAlertSignature(alert), discordAlertSignature({ ...alert, region: "MX" }));
});
test("long offers fit Discord embed limits without acknowledging omitted alerts", () => {
  const payload = buildDiscordWishlistMessage(Array.from({ length: 10 }, (_, index) => ({ ...alert, gameId: `game-${index}-${"x".repeat(120)}`, gameTitle: "x".repeat(300), message: "y".repeat(300) })));
  const description = payload.embeds![0].description;
  assert.equal(typeof description, "string");
  assert.ok(String(description).length <= 4096);
  assert.ok(payload.signatures!.length > 0 && payload.signatures!.length < 10);
  assert.equal(payload.signatures!.length, payload.prices!.length);
  assert.equal((String(description).match(/Ver juego/g) ?? []).length, payload.prices!.length);
});
test("daily and weekly idempotency uses Argentina calendar boundaries", () => {
  assert.equal(argentinaDate(new Date("2026-10-02T02:00:00Z")), "2026-10-01");
  assert.equal(discordWeek(new Date("2026-10-04T22:00:00Z")), "2026-09-28");
});
test("same-origin mutations reject foreign and missing Origin", () => {
  assert.equal(discordSameOrigin(new Request("https://www.shuxteam.com/api", { headers: { origin: "https://evil.example" } })), false);
  assert.equal(discordSameOrigin(new Request("https://www.shuxteam.com/api")), false);
  assert.equal(discordSameOrigin(new Request("https://www.shuxteam.com/api", { headers: { origin: "https://www.shuxteam.com" } })), true);
});
test("safe defaults, allowlist, hard budgets and disabled sender make no requests", async () => {
  const saved = { ...process.env };
  const fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("No network expected"); };
  try {
    delete process.env.DISCORD_SEND_ENABLED; delete process.env.DISCORD_TEST_MODE; delete process.env.DISCORD_TEST_USER_IDS;
    resetDiscordBudget();
    assert.equal(discordSendsEnabled(), false);
    assert.equal(discordRecipientAllowed("123456789012345678"), false);
    process.env.DISCORD_TEST_USER_IDS = "123456789012345678";
    assert.equal(discordRecipientAllowed("123456789012345678"), true);
    process.env.TEST_DISCORD_LIMIT = "999999";
    assert.equal(boundedDiscordSetting("TEST_DISCORD_LIMIT", 30, 100), 100);
    process.env.TEST_DISCORD_LIMIT = "NaN";
    assert.equal(boundedDiscordSetting("TEST_DISCORD_LIMIT", 30, 100), 30);
    await assert.rejects(discordRequest("/users/@me"));
    await assert.rejects(sendDiscordDm("123456789012345678", { content: "test" }, "nonce"));
    await assert.rejects(sendDiscordWebhook({ content: "test" }));
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
