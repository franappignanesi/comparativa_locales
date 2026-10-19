export const WISHLIST_NOTIFICATION_COOLDOWN_MS = 30 * 86400000;

export type NotificationPrice = { gameId: string; region: string; currency: string; price: number };
export type WishlistNotificationState = NotificationPrice & { sentAt: string; rearmed: boolean };

export function wishlistNotificationAllowed(current: NotificationPrice, previous?: WishlistNotificationState, now = Date.now()): boolean {
  if (!current.currency || !Number.isFinite(current.price) || current.price < 0) return false;
  if (!previous) return true;
  const elapsed = now - Date.parse(previous.sentAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return false;
  // A price in another currency or region is not evidence of a discount.
  const comparable = current.currency === previous.currency && current.region === previous.region;
  const meaningfulDrop = comparable && previous.price > 0 && current.price * 100 < previous.price * 95 - 1e-8;
  return meaningfulDrop || elapsed >= WISHLIST_NOTIFICATION_COOLDOWN_MS && previous.rearmed;
}
