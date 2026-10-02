import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { spawnSync } from "node:child_process";
loadEnvConfig(process.cwd());

async function main() {
  const mode = process.env.DISCORD_DM_TRIAL_MODE || "delivery";
  assert.ok(["delivery", "privacy_blocked"].includes(mode), "Unknown trial mode");
  const blockedTrial = mode === "privacy_blocked";
  const recipient = "343930969998491658";
  const { discordRecipientAllowed } = await import("../src/lib/discord-config");
  assert.equal(process.env.DISCORD_TEST_MODE, "1", "Trial requires restricted test mode");
  assert.ok(discordRecipientAllowed(recipient), "Owner must already be allowlisted");
  assert.ok(process.env.DISCORD_BOT_TOKEN, "Bot credential required");
  assert.ok(process.env.GITHUB_RUN_ID, "Trial runs only in the trusted manual workflow");
  const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL!);
  const links = await sql.query("SELECT user_sub FROM discord_links WHERE discord_id=$1 AND verified_at IS NOT NULL", [recipient]);
  assert.equal(links.length, 1, "Verified owner link required");
  const sub = String(links[0].user_sub);
  const { getNotificationSettings, getWishlist } = await import("../src/lib/user-store");
  const settings = await getNotificationSettings(sub);
  assert.ok(settings.discord, "Owner must opt into Discord alerts");
  const wishlist = await getWishlist(sub);
  const { readDiscordPrices, discordPriceFresh } = await import("../src/lib/discord-notifications");
  const latest = await readDiscordPrices(settings.preferredRegion);
  let selected;
  for (const item of wishlist.filter(i => i.notificationEnabled && i.notificationPreferences.priceDrop)) {
    const row = latest.prices.find(r => r.gameId === item.gameId);
    for (const store of settings.enabledStores) {
      const price = row?.prices[store];
      if (discordPriceFresh(price, latest.timestamp) && price?.finalPrice != null) {
        selected = { item, store, price }; break;
      }
    }
    if (selected) break;
  }
  assert.ok(selected, "A fresh enabled wishlist price is required; no preference is modified");
  const { buildDiscordWishlistMessage } = await import("../src/lib/discord-messages");
  const { enqueueDiscord, discordHash, claimDiscordJob } = await import("../src/lib/discord-store");
  const { item, store, price } = selected;
  const key = `dm-owner-trial:${process.env.GITHUB_RUN_ID}`;
  const id = discordHash(key);
  const payload = buildDiscordWishlistMessage([{
    userId: sub, region: settings.preferredRegion, gameId: item.gameId, gameTitle: item.title,
    store, type: "price_drop", message: "Prueba controlada: este es el precio vigente, no una nueva rebaja.",
    triggeredAt: new Date().toISOString(), currentOfficialPrice: price.originalFinalPrice ?? price.finalPrice,
    currentCurrency: price.originalCurrency ?? price.currency, currentArsPrice: price.arsFinalPrice
  }]);
  payload.content = "PRUEBA DE BARATEAM · Alerta de tu lista de deseados";
  // Trial receipts must never suppress genuine wishlist notifications.
  payload.signatures = [discordHash(`${key}:receipt`)];
  const runWorker = () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/discord-notifications.ts"], {
      encoding: "utf8", timeout: 240000, env: { ...process.env, DISCORD_ONLY_JOB_ID: id, DISCORD_MAX_MESSAGES_PER_RUN: "1" }
    });
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    return result;
  };
  await enqueueDiscord(key, "dm", sub, recipient, payload);
  const first = runWorker();
  if (blockedTrial) {
    assert.equal(first.status, 1, "Expected a rejected Discord request, not a successful delivery");
    assert.ok((first.stderr || "").split("\n").some(line => line.includes('"status":403') && line.includes('"providerCode":50007')), "Must confirm Discord privacy rejection, not a configuration failure");
  } else {
    assert.equal(first.status, 0, "Isolated delivery worker failed; do not blindly replay uncertain sends");
  }
  const rows = await sql.query("SELECT status,attempts FROM discord_outbox WHERE id=$1", [id]);
  assert.equal(rows[0]?.status, blockedTrial ? "blocked" : "sent", "Expected final provider-confirmed outcome");
  const attempts = Number(rows[0].attempts);
  assert.equal((await enqueueDiscord(key, "dm", sub, recipient, payload)).shouldDispatch, false);
  assert.equal(await claimDiscordJob(id), null);
  assert.equal(runWorker().status, 0, "Completed or blocked trial must not be retried");
  const after = await sql.query("SELECT status,attempts FROM discord_outbox WHERE id=$1", [id]);
  assert.equal(Number(after[0].attempts), attempts);
  console.log(JSON.stringify({ confirmed: !blockedTrial, privacyRejectionConfirmed: blockedTrial, duplicatePrevented: true, otherRecipientsProcessed: 0, region: settings.preferredRegion }));
}
main().catch(() => { console.error("Owner DM trial did not complete. Inspect the isolated worker result; no automatic replay or settings changes."); process.exitCode = 1; });
