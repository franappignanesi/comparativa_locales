"use client";

import type { GoogleUser, WishlistGame } from "@/app/components/UserMenu";
import type { StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";

export type NotificationSettings = {
  email: boolean;
  webPush: boolean;
  discord: boolean;
  enabledStores: StoreId[];
};

export type WishlistAlert = {
  userId: string;
  region: string;
  gameId: string;
  gameTitle: string;
  store: string;
  type: "price_drop" | "below_usd" | "historical_low";
  message: string;
  triggeredAt: string;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  email: false,
  webPush: false,
  discord: false,
  enabledStores: [...STORES]
};

export function readStoredUser(): GoogleUser | null {
  const savedUser = window.localStorage.getItem("glitchprice-user");
  if (!savedUser) return null;
  try {
    return JSON.parse(savedUser) as GoogleUser;
  } catch {
    window.localStorage.removeItem("glitchprice-user");
    return null;
  }
}

export async function persistSession(user: GoogleUser): Promise<void> {
  window.localStorage.setItem("glitchprice-user", JSON.stringify(user));
}

export async function fetchWishlist(userId: string): Promise<WishlistGame[]> {
  const response = await fetch("/api/user/wishlist");
  if (!response.ok) return [];
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  const wishlist = payload.wishlist ?? [];
  if (wishlist.length) return wishlist;

  const legacyWishlist = readLegacyWishlist(userId);
  if (!legacyWishlist.length) return wishlist;
  let migrated = wishlist;
  for (const item of legacyWishlist) {
    const addResponse = await fetch("/api/user/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item })
    });
    const addPayload = (await addResponse.json()) as { wishlist?: WishlistGame[] };
    migrated = addPayload.wishlist ?? migrated;
  }
  markLegacyWishlistMigrated(userId);
  return migrated;
}

export async function addWishlistItem(userId: string, item: WishlistGame): Promise<WishlistGame[]> {
  const response = await fetch("/api/user/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item })
  });
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  return payload.wishlist ?? [];
}

export async function updateWishlistItem(userId: string, gameId: string, updates: Partial<WishlistGame>): Promise<WishlistGame[]> {
  const response = await fetch("/api/user/wishlist", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId,
      notificationEnabled: updates.notificationEnabled,
      notificationPreferences: updates.notificationPreferences
    })
  });
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  return payload.wishlist ?? [];
}

export async function deleteWishlistItem(userId: string, gameId: string): Promise<WishlistGame[]> {
  const response = await fetch(`/api/user/wishlist?gameId=${encodeURIComponent(gameId)}`, {
    method: "DELETE"
  });
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  removeLegacyWishlistItem(userId, gameId);
  return payload.wishlist ?? [];
}

export async function fetchWishlistAlerts(userId: string, region: string): Promise<WishlistAlert[]> {
  const response = await fetch(`/api/user/wishlist-alerts?region=${encodeURIComponent(region)}`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { alerts?: WishlistAlert[] };
  return payload.alerts ?? [];
}

export async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const response = await fetch("/api/user/notification-settings");
  if (!response.ok) return DEFAULT_NOTIFICATION_SETTINGS;
  const payload = (await response.json()) as { settings?: NotificationSettings };
  return normalizeNotificationSettings(payload.settings);
}

export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<NotificationSettings> {
  const response = await fetch("/api/user/notification-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings })
  });
  const payload = (await response.json()) as { settings?: NotificationSettings };
  return normalizeNotificationSettings(payload.settings ?? settings);
}

export function normalizeNotificationSettings(settings: Partial<NotificationSettings> | undefined | null): NotificationSettings {
  const enabledStores = settings?.enabledStores?.filter((store): store is StoreId => STORES.includes(store as StoreId));
  return {
    email: Boolean(settings?.email),
    webPush: Boolean(settings?.webPush),
    discord: Boolean(settings?.discord),
    enabledStores: enabledStores?.length ? enabledStores : [...STORES]
  };
}

function readLegacyWishlist(userId: string): WishlistGame[] {
  if (window.localStorage.getItem(`glitchprice-wishlist-migrated:${userId}`) === "1") return [];
  try {
    return JSON.parse(window.localStorage.getItem(`glitchprice-wishlist:${userId}`) ?? "[]") as WishlistGame[];
  } catch {
    return [];
  }
}

function markLegacyWishlistMigrated(userId: string): void {
  window.localStorage.setItem(`glitchprice-wishlist-migrated:${userId}`, "1");
  window.localStorage.removeItem(`glitchprice-wishlist:${userId}`);
}

function removeLegacyWishlistItem(userId: string, gameId: string): void {
  try {
    const key = `glitchprice-wishlist:${userId}`;
    const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as WishlistGame[];
    window.localStorage.setItem(key, JSON.stringify(current.filter((item) => item.gameId !== gameId)));
  } catch {
    window.localStorage.removeItem(`glitchprice-wishlist:${userId}`);
  }
}
