import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());

// Synthetic, explicitly claimed jobs only. Never calls a messaging provider.
async function main() {
  const { enqueueDiscord, claimDiscordJob, finishDiscordJob, discordHash } = await import("../src/lib/discord-store");
  const { wishlistNotificationStates, filterWishlistNotifications, rearmWishlistNotifications } = await import("../src/lib/wishlist-notification-state");
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Postgres configuration required");
  const sql = neon(url);
  const user = `notification-policy-test-${randomUUID()}`;
  const jobIds: string[] = [];
  const alert = { userId: user, region: "AR" as const, gameId: "synthetic-game", gameTitle: "Synthetic test", store: "steam" as const,
    type: "below_usd" as const, message: "Never dispatch", triggeredAt: new Date().toISOString(), currentOfficialPrice: 14.77,
    currentCurrency: "USD", currentArsPrice: 20000, thresholdUsd: 15 };
  try {
    for (const [index, status] of (["blocked", "uncertain", "wrong-owner", "sent"] as const).entries()) {
      const id = `${user}-${index}`;
      jobIds.push(discordHash(id));
      await enqueueDiscord(id, "dm", user, "0", { region: "AR", signatures: [discordHash(id)],
        prices: [{ gameId: alert.gameId, store: "steam", currency: "USD", price: 14.77, type: "below_usd", thresholdUsd: 15 }] });
      const job = await claimDiscordJob(discordHash(id));
      assert.ok(job);
      await finishDiscordJob(status === "wrong-owner" ? { ...job, owner: randomUUID() } : job, status === "wrong-owner" ? "sent" : status);
      assert.equal((await wishlistNotificationStates("discord", user)).has(alert.gameId), status === "sent");
    }
    for (const price of [14.77, 14.82, 14.8, 14.04]) {
      assert.equal((await filterWishlistNotifications("discord", user, [{ ...alert, store: "gog", currentOfficialPrice: price }])).alerts.length, 0);
    }
    assert.equal((await filterWishlistNotifications("discord", user, [{ ...alert, currentOfficialPrice: 14.03 }])).alerts.length, 1);
    await sql.query("UPDATE wishlist_notification_state SET sent_at=NOW()-INTERVAL '31 days' WHERE user_sub=$1", [user]);
    assert.equal((await filterWishlistNotifications("discord", user, [alert])).alerts.length, 0);
    await rearmWishlistNotifications(user, [], []);
    assert.equal((await filterWishlistNotifications("discord", user, [alert])).alerts.length, 0);
    await rearmWishlistNotifications(user, [], [alert.gameId]);
    assert.equal((await filterWishlistNotifications("discord", user, [alert])).alerts.length, 1);
    assert.equal((await filterWishlistNotifications("email", user, [alert])).alerts.length, 1);
    console.log("Policy integration passed: confirmed sends only, owner guard, cross-store suppression, accumulated drop, no 30-day replay, fresh-condition rearm, independent channels. No messages sent.");
  } finally {
    await sql.query("DELETE FROM discord_outbox WHERE id=ANY($1::text[])", [jobIds]);
    await sql.query("DELETE FROM discord_alert_receipts WHERE user_sub=$1", [user]);
    await sql.query("DELETE FROM wishlist_notification_state WHERE user_sub=$1", [user]);
  }
}
main().catch(error => {
  console.error("Notification policy integration failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
