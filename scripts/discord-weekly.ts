import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { DISCORD_SITE, discordSendsEnabled, discordWebhookUrl } = await import("../src/lib/discord-config");
  const { readDiscordPrices, discordPriceFresh } = await import("../src/lib/discord-notifications");
  const { enqueueDiscord } = await import("../src/lib/discord-store");
  const { discordText, discordWeek } = await import("../src/lib/discord-messages");
  const { getWishlistRanking } = await import("../src/lib/user-store");
  const { STORE_NAMES } = await import("../src/lib/seo");
  const { STORES } = await import("../src/lib/types");
  const latest = await readDiscordPrices("AR");
  const popularity = new Map((await getWishlistRanking()).map((game) => [game.gameId, game.saves]));
  const offers = latest.prices.flatMap((game) => {
    const prices = STORES.flatMap((store) => {
      const price = game.prices[store];
      const amount = price?.originalFinalPrice ?? price?.finalPrice;
      return price && discordPriceFresh(price, latest.timestamp) && amount != null && amount > 0 && price.discountPct != null && price.discountPct >= 20 && price.discountPct <= 100 && price.url ? [{ store, price, amount }] : [];
    }).sort((a, b) => (b.price.discountPct ?? 0) - (a.price.discountPct ?? 0));
    return prices[0] ? [{ game, ...prices[0], score: (prices[0].price.discountPct ?? 0) + Math.min(15, Math.log2(1 + (popularity.get(game.gameId) ?? 0)) * 3) }] : [];
  }).sort((a, b) => b.score - a.score || a.game.gameTitle.localeCompare(b.game.gameTitle)).slice(0, 5);
  if (!offers.length) throw new Error("No eligible current offers");
  const payload = { content: "Las ofertas de la semana en BARATEAM", embeds: [{ title: "Cinco ofertas para viciar", url: `${DISCORD_SITE}/biblioteca?filter=ofertas`, color: 0xffcf00,
    description: offers.map(({ game, store, price, amount }, index) => `**${index + 1}. ${discordText(game.gameTitle)}**\n${STORE_NAMES[store]} · **${price.originalCurrency ?? price.currency} ${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}** · **-${price.discountPct}%**\n[Comparar precios](${DISCORD_SITE}/juegos/${encodeURIComponent(game.gameId)})`).join("\n\n"),
    footer: { text: "Argentina · Precios sin impuestos. Selección por descuento y popularidad. Las ofertas pueden terminar: confirmá en la tienda." }, timestamp: latest.timestamp! }] };
  if (process.argv.includes("--preview") || !discordSendsEnabled() || process.env.DISCORD_WEEKLY_ENABLED !== "1") { console.log(JSON.stringify({ preview: true, ...payload }, null, 2)); return; }
  if (!discordWebhookUrl(process.env.DISCORD_WEEKLY_WEBHOOK_URL)) throw new Error("Invalid webhook URL");
  await enqueueDiscord(`weekly:${discordWeek()}`, "weekly", "weekly", "weekly", payload);
  console.log("Weekly Discord digest queued; run notifications:discord to dispatch.");
}
main().catch((error) => { console.error(error instanceof Error && error.message === "Invalid webhook URL" ? "DISCORD_WEEKLY_WEBHOOK_URL must contain the complete Discord webhook URL copied from Channel > Integrations > Webhooks > Copy Webhook URL, not a token, channel URL or invitation. The value is never logged." : "Weekly Discord digest unavailable: check current price cache and configuration."); process.exitCode = 1; });
