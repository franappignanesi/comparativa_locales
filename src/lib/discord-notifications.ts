import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discordRecipientAllowed, discordSendsEnabled } from "./discord-config";
import { discordUnsentSignatures, enqueueDiscord, getDiscordLink } from "./discord-store";
import { argentinaDate, buildDiscordWishlistMessage, discordAlertSignature } from "./discord-messages";
import type { StoredUser } from "./user-store";
import type { WishlistAlert } from "./wishlist-alerts";
import type { LatestPrices, NormalizedPrice } from "./types";
import type { RegionId } from "./regions";
import { legacyDiscordNotificationKey } from "./wishlist-notification-key";

export async function readDiscordPrices(region: RegionId): Promise<LatestPrices> {
  const file = region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`;
  const latest = JSON.parse(await readFile(join(process.cwd(), "data/generated", file), "utf8")) as LatestPrices;
  const age = Date.now() - Date.parse(latest.timestamp ?? "");
  if (!Number.isFinite(age) || age < -300000 || age > 48 * 3600000) throw new Error("Discord needs a fresh published price cache");
  return latest;
}
export function discordPriceFresh(price: NormalizedPrice | undefined, timestamp: string | null) {
  const age = Date.now() - Date.parse(price?.fetchedAt ?? timestamp ?? "");
  return Boolean(price?.available && !price.isStale && Number.isFinite(age) && age >= -300000 && age <= 48 * 3600000);
}
export async function enqueueDiscordWishlist(user: StoredUser, alerts: WishlistAlert[]) {
  if (!discordSendsEnabled() || !user.notificationSettings.discord || !alerts.length) return 0;
  const link = await getDiscordLink(user.sub);
  if (!link?.verified || !discordRecipientAllowed(link.discordId)) return 0;
  const legacyKeys = (alert: WishlistAlert) => (["price_drop", "historical_low", "below_usd"] as const).map(type => legacyDiscordNotificationKey({ ...alert, type }));
  const delivered = await discordUnsentSignatures(user.sub, alerts.flatMap(alert => [discordAlertSignature(alert), ...legacyKeys(alert)]));
  const fresh = alerts.filter((alert) => !delivered.has(discordAlertSignature(alert)) && !legacyKeys(alert).some(key => delivered.has(key)) && alert.currentOfficialPrice != null && alert.currentCurrency);
  if (!fresh.length) return 0;
  const payload = buildDiscordWishlistMessage(fresh);
  if (!payload.signatures?.length) return 0;
  await enqueueDiscord(`dm:${link.discordId}:${argentinaDate()}`, "dm", user.sub, link.discordId, payload);
  return 1;
}
