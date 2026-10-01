import { createHash } from "node:crypto";
import type { WishlistAlert } from "./wishlist-alerts";
import { DISCORD_SITE } from "./discord-config";
import { STORE_NAMES } from "./seo";
import type { DiscordPayload } from "./discord-store";

export function discordText(value: string, max = 180) { return value.replace(/[\\`*_~|<>\[\]\r\n]/g, " ").replace(/@/g, "＠").slice(0, max); }
export function discordAlertSignature(alert: WishlistAlert) {
  return createHash("sha256").update(JSON.stringify([alert.region, alert.gameId, alert.store, alert.type, alert.currentCurrency, alert.currentOfficialPrice])).digest("hex");
}
export function buildDiscordWishlistMessage(alerts: WishlistAlert[]): DiscordPayload {
  const unique = [...new Map(alerts.map((alert) => [`${alert.gameId}:${alert.store}`, alert])).values()].slice(0, 10);
  const included: WishlistAlert[] = [];
  const lines: string[] = [];
  for (const alert of unique) {
    const price = alert.currentOfficialPrice == null ? "Precio actualizado" : `${alert.currentCurrency} ${alert.currentOfficialPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    const line = `**${discordText(alert.gameTitle)}**\n${discordText(alert.message)} · ${discordText(STORE_NAMES[alert.store])}\n**${discordText(price)}** · ${alert.region}\n[Ver juego](${DISCORD_SITE}/juegos/${encodeURIComponent(alert.gameId)})`;
    if ([...lines, line].join("\n\n").length > 4096) continue;
    lines.push(line);
    included.push(alert);
  }
  return {
    content: "Novedades en tu lista de deseados de BARATEAM",
    embeds: [{ title: "Tus alertas de precio", color: 0xffcf00, url: `${DISCORD_SITE}/wishlist`,
      description: lines.join("\n\n"), footer: { text: "Precios sin impuestos. Confirmalos en la tienda. Desactivá los MD desde tu perfil de BARATEAM." } }],
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
