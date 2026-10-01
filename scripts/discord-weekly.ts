import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { discordSendsEnabled, discordWebhookUrl } = await import("../src/lib/discord-config");
  const { readDiscordPrices } = await import("../src/lib/discord-notifications");
  const { enqueueDiscord, getRecentDiscordBargains } = await import("../src/lib/discord-store");
  const { discordWeek } = await import("../src/lib/discord-messages");
  const { buildDiscordWeeklyMessage } = await import("../src/lib/discord-weekly-message");
  const { getGameSample } = await import("../src/lib/sample-builder");
  const { getWeekendGames } = await import("../src/lib/weekend-games");
  const { getWishlistRanking } = await import("../src/lib/user-store");
  const latest = await readDiscordPrices("AR");
  const popularity = new Map((await getWishlistRanking()).map((game) => [game.gameId, game.saves]));
  const payload = buildDiscordWeeklyMessage(latest, (await getGameSample()).broadSample, getWeekendGames(), popularity, await getRecentDiscordBargains());
  if (process.argv.includes("--preview") || !discordSendsEnabled() || process.env.DISCORD_WEEKLY_ENABLED !== "1") { console.log(JSON.stringify({ preview: true, ...payload }, null, 2)); return; }
  if (!discordWebhookUrl(process.env.DISCORD_WEEKLY_WEBHOOK_URL)) throw new Error("Invalid webhook URL");
  await enqueueDiscord(`weekly:${discordWeek()}`, "weekly", "weekly", "weekly", payload);
  console.log("Weekly Discord digest queued; run notifications:discord to dispatch.");
}
main().catch((error) => { console.error(error instanceof Error && error.message === "Invalid webhook URL" ? "DISCORD_WEEKLY_WEBHOOK_URL must contain the complete Discord webhook URL copied from Channel > Integrations > Webhooks > Copy Webhook URL, not a token, channel URL or invitation. The value is never logged." : "Weekly Discord digest unavailable: check current price cache and configuration."); process.exitCode = 1; });
