import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());

// Synthetic outbox jobs only: this test never invokes Discord or claims unrelated jobs.
async function main() {
  const { enqueueDiscord, claimDiscordJob, finishDiscordJob, getRecentDiscordBargains, discordHash } = await import("../src/lib/discord-store");
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Postgres configuration required");
  const sql = neon(url);
  const prefix = `weekly-test-${randomUUID()}`;
  const ids = ["sent", "blocked", "uncertain", "wrong-owner"].map((suffix) => `${prefix}-${suffix}`);
  try {
    for (const [index, id] of ids.entries()) {
      await enqueueDiscord(id, "weekly", "weekly", "weekly", { content: "Synthetic test; never dispatch", bargainGameIds: [id] });
      assert.ok(!(await getRecentDiscordBargains()).has(id));
      const job = await claimDiscordJob(discordHash(id));
      assert.ok(job);
      const status = ["sent", "blocked", "uncertain", "sent"][index] as "sent" | "blocked" | "uncertain";
      await finishDiscordJob(index === 3 ? { ...job, owner: randomUUID() } : job, status);
      assert.equal((await getRecentDiscordBargains()).has(id), index === 0);
      if (index === 0) {
        await enqueueDiscord(id, "weekly", "weekly", "weekly", { content: "Cannot replay", bargainGameIds: [id] });
        assert.equal(await claimDiscordJob(discordHash(id)), null);
        await sql.query("UPDATE discord_weekly_bargains SET sent_at=NOW()-INTERVAL '61 days' WHERE game_id=$1", [id]);
        assert.ok(!(await getRecentDiscordBargains()).has(id));
        await sql.query("UPDATE discord_weekly_bargains SET sent_at=NOW()-INTERVAL '59 days' WHERE game_id=$1", [id]);
        assert.ok((await getRecentDiscordBargains()).has(id));
      }
    }
    console.log("Weekly cooldown integration passed: confirmed sends only, owner guard, 60-day window, no replay. No Discord requests.");
  } finally {
    await sql.query("DELETE FROM discord_outbox WHERE id=ANY($1::text[])", [ids.map(discordHash)]);
    await sql.query("DELETE FROM discord_weekly_bargains WHERE game_id=ANY($1::text[])", [ids]);
  }
}
main().catch(() => { console.error("Weekly integration failed; synthetic rows cleaned where possible. No Discord requests."); process.exitCode = 1; });
