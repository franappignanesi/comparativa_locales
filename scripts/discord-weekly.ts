import { loadEnvConfig } from "@next/env";
import { appendFile } from "node:fs/promises";
loadEnvConfig(process.cwd());

async function report(message: string, dispatch: boolean) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Resumen semanal de Discord\n\n${message}\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `dispatch=${dispatch}\n`);
}

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
  if (process.argv.includes("--preview") || !discordSendsEnabled() || process.env.DISCORD_WEEKLY_ENABLED !== "1") {
    console.log(JSON.stringify({ preview: true, ...payload }, null, 2));
    await report("Vista previa: no se envió ningún mensaje a Discord.", false); return;
  }
  if (!discordWebhookUrl(process.env.DISCORD_WEEKLY_WEBHOOK_URL)) throw new Error("Invalid webhook URL");
  const testRun = process.env.DISCORD_WEEKLY_TEST_RUN;
  if (testRun && !/^\d+$/.test(testRun)) throw new Error("Invalid test run");
  if (testRun) payload.content = `🧪 **Prueba del resumen semanal**\n${payload.content}`;
  const result = await enqueueDiscord(testRun ? `weekly-test:${testRun}` : `weekly:${discordWeek()}`, "weekly", "weekly", "weekly", payload);
  await report(result.shouldDispatch
    ? "Resumen en cola para envío. Revisá el resultado del paso «Publish queued digest» para confirmar la entrega."
    : result.status === "sent"
      ? "No se envió otro mensaje: este resumen ya fue publicado. La protección contra duplicados evitó repetirlo. Para probar el formato nuevo, iniciá una nueva corrida con preview desactivado y test_publish activado."
      : `No se enviará el resumen automáticamente (estado: ${result.status}). Revisá la cola antes de reintentar.`, result.shouldDispatch);
}
main().catch((error) => { console.error(error instanceof Error && error.message === "Invalid webhook URL" ? "DISCORD_WEEKLY_WEBHOOK_URL must contain the complete Discord webhook URL copied from Channel > Integrations > Webhooks > Copy Webhook URL, not a token, channel URL or invitation. The value is never logged." : "Weekly Discord digest unavailable: check current price cache and configuration."); process.exitCode = 1; });
