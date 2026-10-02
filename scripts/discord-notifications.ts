import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { boundedDiscordSetting, discordRecipientAllowed, discordSendsEnabled } = await import("../src/lib/discord-config");
  if (!discordSendsEnabled()) { console.log("Discord sending disabled; nothing sent."); return; }
  const onlyId = process.env.DISCORD_ONLY_JOB_ID || null;
  if (onlyId && !/^[a-f0-9]{64}$/.test(onlyId)) throw new Error("Invalid isolated Discord job ID");
  const { acquireJobLock } = await import("../src/lib/job-lock");
  const lock = await acquireJobLock("discord-notifications", { ttlMs: 600000 });
  if (!lock.acquired) { console.log("Discord worker already running."); return; }
  const { claimDiscordJob, finishDiscordJob, getDiscordLink, pruneDiscordStore } = await import("../src/lib/discord-store");
  const { DiscordApiError, resetDiscordBudget, sendDiscordDm, sendDiscordWebhook } = await import("../src/lib/discord-api");
  const { getNotificationSettings, getWishlist } = await import("../src/lib/user-store");
  const { readDiscordPrices } = await import("../src/lib/discord-notifications");
  const { discordDmConsentValid, discordDmOffersValid } = await import("../src/lib/discord-dm-validation");
  const { REGIONS } = await import("../src/lib/regions");
  const deadline = Date.now() + boundedDiscordSetting("DISCORD_WORKER_MAX_MS", 180000, 300000);
  const maximum = boundedDiscordSetting("DISCORD_MAX_MESSAGES_PER_RUN", 30, 100);
  let sent = 0, blocked = 0, failures = 0;
  const prices = new Map<string, Awaited<ReturnType<typeof readDiscordPrices>>>();
  resetDiscordBudget();
  try {
    await pruneDiscordStore();
    for (let count = 0; count < maximum && Date.now() < deadline - 30000; count++) {
      const job = await claimDiscordJob(onlyId);
      if (!job) break;
      try {
        if (job.kind === "dm") {
          const [link, settings, wishlist] = await Promise.all([getDiscordLink(job.userSub), getNotificationSettings(job.userSub), getWishlist(job.userSub)]);
          if (!discordDmConsentValid(job, link, settings, discordRecipientAllowed(job.recipient))) {
            await finishDiscordJob(job, "blocked"); blocked++; continue;
          }
          const region = REGIONS.find((item) => item.id === job.payload.region)?.id;
          if (!region) throw new Error("Invalid region");
          const latest = prices.get(region) ?? await readDiscordPrices(region);
          prices.set(region, latest);
          const valid = discordDmOffersValid(job, settings, wishlist, latest);
          if (!valid) { await finishDiscordJob(job, "blocked"); blocked++; continue; }
          await sendDiscordDm(job.recipient, { content: job.payload.content, embeds: job.payload.embeds }, job.id);
        } else {
          if (process.env.DISCORD_WEEKLY_ENABLED !== "1") { await finishDiscordJob(job, "blocked"); blocked++; continue; }
          await readDiscordPrices("AR");
          await sendDiscordWebhook({ content: job.payload.content, embeds: job.payload.embeds }, { test: job.payload.weeklyTest === true });
        }
        await finishDiscordJob(job, "sent"); sent++;
      } catch (error) {
        failures++;
        const apiError = error instanceof DiscordApiError ? error : null;
        console.error("[discord-worker] delivery failed", JSON.stringify({ kind: job.kind, status: apiError?.status ?? null, providerCode: apiError?.providerCode ?? null, reason: apiError?.reason ?? "unconfirmed", ambiguous: apiError?.ambiguous ?? true }));
        const exhaustedTrial = apiError?.reason === "weekly_test_daily_limit";
        if (apiError?.reason === "weekly_daily_limit" || exhaustedTrial) {
          const message = exhaustedTrial
            ? "Se alcanzó el límite de 3 pruebas manuales por día. No se enviará esta prueba más tarde. El cupo se reinicia a las 21:00 de Argentina."
            : "Se alcanzó el límite de 2 envíos normales por día. Para probar cambios de formato, usá test_publish. El cupo se reinicia a las 21:00 de Argentina.";
          console.error(message);
          if (process.env.GITHUB_STEP_SUMMARY) {
            const { appendFile } = await import("node:fs/promises");
            await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n**No se envió el mensaje:** ${message}\n`);
          }
        }
        const status = exhaustedTrial ? "blocked" : apiError?.ambiguous ? "uncertain" : apiError && [429, 401, 503].includes(apiError.status) ? "pending" : "blocked";
        await finishDiscordJob(job, status, Math.max(60, apiError?.retryAfter || 3600));
        if (!apiError || apiError.status === 401 || apiError.status === 429 || apiError.status === 503 || failures >= 3) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log(JSON.stringify({ sent, blocked, failures, limit: maximum }));
    if (failures) process.exitCode = 1;
  } finally { await lock.release(); }
}
main().catch(() => { console.error("Discord worker failed; inspect configuration and delivery state. No automatic replay of ambiguous sends."); process.exitCode = 1; });
