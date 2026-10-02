import { wishlistNotificationKey } from "./wishlist-notification-key";
import type { WishlistAlert } from "./wishlist-alerts";
import { DISCORD_SITE } from "./discord-config";
import { STORE_NAMES } from "./seo";
import type { DiscordPayload } from "./discord-store";

export function discordText(value: string, max = 180) { return value.replace(/[\\`*_~|<>\[\]\r\n]/g, " ").replace(/@/g, "＠").slice(0, max); }
export function discordAlertSignature(alert: WishlistAlert) {
  return wishlistNotificationKey(alert);
}
export function buildDiscordWishlistMessage(alerts: WishlistAlert[], options: { trial?: boolean } = {}): DiscordPayload {
  const unique = [...new Map(alerts.map((alert) => [`${alert.gameId}:${alert.store}`, alert])).values()].slice(0, 10);
  const included: WishlistAlert[] = [];
  const lines: string[] = [];
  for (const alert of unique) {
    const price = alert.currentOfficialPrice == null ? "Precio actualizado" : `${alert.currentCurrency} ${alert.currentOfficialPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    const game = `**${discordText(alert.gameTitle)}**`;
    const store = discordText(STORE_NAMES[alert.store]);
    const condition = alert.type === "below_usd"
      ? `Me pediste que te avise cuando ${game} esté en USD ${alert.thresholdUsd?.toLocaleString("es-AR", { maximumFractionDigits: 2 })} o menos. ¡Ya cumple ese límite en ${store}!`
      : alert.type === "historical_low"
        ? `Me pediste que te avise cuando ${game} alcance su mínimo histórico. ¡Igualó o mejoró el mínimo registrado en ${store}!`
        : `Me pediste que te avise cuando ${game} baje de precio. ¡Detectamos una bajada en ${store}!`;
    const line = `${options.trial ? `${game}\n${discordText(alert.message)}` : condition}\n**${discordText(price)}** · ${alert.region}\nChequealo acá: [Ver juego](${DISCORD_SITE}/juegos/${encodeURIComponent(alert.gameId)})`;
    if ([...lines, line].join("\n\n").length > 4096) continue;
    lines.push(line);
    included.push(alert);
  }
  return {
    content: "¡Buenas! Tengo novedades de tu lista de deseados de BARATEAM.",
    embeds: [{ title: "Tus alertas de precio", color: 0xffcf00, url: `${DISCORD_SITE}/wishlist`,
      description: lines.join("\n\n"), footer: { text: "Acordate que podés modificar las condiciones desde tu lista de deseados de BARATEAM, y los canales desde tu perfil. Precios sin impuestos: confirmalos en la tienda. ¡Saludos!" } }],
    signatures: included.map(discordAlertSignature), region: included[0]?.region,
    prices: included.map((alert) => ({ gameId: alert.gameId, store: alert.store, currency: alert.currentCurrency ?? "", price: alert.currentOfficialPrice ?? -1, type: alert.type, thresholdUsd: alert.thresholdUsd }))
  };
}
export function argentinaDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function discordWeek(now = new Date()) {
  const date = new Date(`${argentinaDate(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
// A weekend and its Monday fallback belong to the same Friday-start editorial cycle.
export function discordDigestPeriod(now = new Date()) {
  const date = new Date(`${argentinaDate(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 2) % 7);
  return date.toISOString().slice(0, 10);
}
