import { createHash } from "node:crypto";
import type { WishlistAlert } from "./wishlist-alerts";

export type WishlistNotificationIdentity = Pick<WishlistAlert, "region" | "gameId" | "store" | "type" | "currentCurrency" | "currentOfficialPrice" | "thresholdUsd">;

export function wishlistNotificationKey(alert: WishlistNotificationIdentity, deliveryCycle?: string): string {
  // The same offer must not repeat when another enabled condition becomes its reason.
  const identity = [alert.region, alert.gameId, alert.store, alert.currentCurrency, alert.currentOfficialPrice];
  return createHash("sha256").update(JSON.stringify(deliveryCycle ? [...identity, deliveryCycle] : identity)).digest("hex");
}

export function legacyDiscordNotificationKey(alert: WishlistNotificationIdentity): string {
  return createHash("sha256").update(JSON.stringify([alert.region, alert.gameId, alert.store, alert.type, alert.currentCurrency, alert.currentOfficialPrice])).digest("hex");
}
