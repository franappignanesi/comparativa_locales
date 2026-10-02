import type { DiscordJob, DiscordLink } from "./discord-store";
import type { NotificationSettings, StoredWishlistItem } from "./user-store";
import type { LatestPrices } from "./types";
import { discordPriceFresh } from "./discord-notifications";

export function discordDmConsentValid(job: DiscordJob, link: DiscordLink | null, settings: NotificationSettings, recipientAllowed: boolean) {
  return Boolean(link?.verified && link.discordId === job.recipient && settings.discord && recipientAllowed && settings.preferredRegion === job.payload.region);
}

export function discordDmOffersValid(job: DiscordJob, settings: NotificationSettings, wishlist: StoredWishlistItem[], latest: LatestPrices) {
  return Boolean(job.payload.prices?.length && job.payload.prices.every(item => {
    if (!["price_drop", "historical_low", "below_usd"].includes(item.type)) return false;
    const entry = wishlist.find(game => game.gameId === item.gameId);
    if (!entry?.notificationEnabled) return false;
    const preferences = entry.notificationPreferences;
    if (item.type === "price_drop" && !preferences.priceDrop || item.type === "historical_low" && !preferences.historicalLow || item.type === "below_usd" && (!preferences.belowUsd || preferences.belowUsdValue !== item.thresholdUsd)) return false;
    if (!settings.enabledStores.includes(item.store as typeof settings.enabledStores[number])) return false;
    const price = latest.prices.find(row => row.gameId === item.gameId)?.prices[item.store as typeof settings.enabledStores[number]];
    return discordPriceFresh(price, latest.timestamp) && price && (price.originalCurrency ?? price.currency) === item.currency && (price.originalFinalPrice ?? price.finalPrice) === item.price;
  }));
}
