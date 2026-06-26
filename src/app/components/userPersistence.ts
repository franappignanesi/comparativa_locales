"use client";

import type { GoogleUser, WishlistGame } from "@/app/components/UserMenu";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import type { StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";

export type NotificationSettings = {
  email: boolean;
  webPush: boolean;
  discord: boolean;
  enabledStores: StoreId[];
  preferredRegion: RegionId;
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
  enabledStores: [...STORES],
  preferredRegion: DEFAULT_REGION
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
  const localWishlist = readLocalWishlist(userId);
  const response = await fetch("/api/user/wishlist").catch(() => null);
  if (!response) return localWishlist;
  if (response.status === 401) {
    handleExpiredSession();
    return [];
  }
  if (!response.ok) return localWishlist;
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  const wishlist = payload.wishlist ?? [];
  if (wishlist.length) {
    writeLocalWishlist(userId, wishlist);
    return wishlist;
  }

  if (!localWishlist.length) return wishlist;
  let migrated = wishlist;
  let migrationFailed = false;
  for (const item of localWishlist) {
    const addResponse = await fetch("/api/user/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item })
    });
    if (!addResponse.ok) {
      migrationFailed = true;
      break;
    }
    const addPayload = (await addResponse.json()) as { wishlist?: WishlistGame[] };
    migrated = addPayload.wishlist ?? migrated;
  }
  if (migrationFailed) return localWishlist;
  writeLocalWishlist(userId, migrated);
  markLegacyWishlistMigrated(userId);
  return migrated;
}

export async function addWishlistItem(userId: string, item: WishlistGame): Promise<WishlistGame[]> {
  const response = await fetch("/api/user/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item })
  }).catch(() => null);
  if (!response) return addLocalWishlistItem(userId, item);
  await assertAuthenticated(response);
  if (!response.ok) return addLocalWishlistItem(userId, item);
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  const wishlist = payload.wishlist ?? addLocalWishlistItem(userId, item);
  writeLocalWishlist(userId, wishlist);
  return wishlist;
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
  }).catch(() => null);
  if (!response) return updateLocalWishlistItem(userId, gameId, updates);
  await assertAuthenticated(response);
  if (!response.ok) return updateLocalWishlistItem(userId, gameId, updates);
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  const wishlist = payload.wishlist ?? updateLocalWishlistItem(userId, gameId, updates);
  writeLocalWishlist(userId, wishlist);
  return wishlist;
}

export async function deleteWishlistItem(userId: string, gameId: string): Promise<WishlistGame[]> {
  const response = await fetch(`/api/user/wishlist?gameId=${encodeURIComponent(gameId)}`, {
    method: "DELETE"
  }).catch(() => null);
  if (!response) return removeLocalWishlistItem(userId, gameId);
  await assertAuthenticated(response);
  if (!response.ok) return removeLocalWishlistItem(userId, gameId);
  const payload = (await response.json()) as { wishlist?: WishlistGame[] };
  const wishlist = payload.wishlist ?? removeLocalWishlistItem(userId, gameId);
  writeLocalWishlist(userId, wishlist);
  return wishlist;
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
    enabledStores: enabledStores?.length ? enabledStores : [...STORES],
    preferredRegion: normalizePreferredRegion(settings?.preferredRegion)
  };
}

function normalizePreferredRegion(value: unknown): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}

async function assertAuthenticated(response: Response): Promise<void> {
  if (response.status !== 401) return;
  handleExpiredSession();
  throw new Error("session_expired");
}

function handleExpiredSession(): void {
  window.localStorage.removeItem("glitchprice-user");
  window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"));
}

function readLocalWishlist(userId: string): WishlistGame[] {
  try {
    return JSON.parse(window.localStorage.getItem(`glitchprice-wishlist:${userId}`) ?? "[]") as WishlistGame[];
  } catch {
    return [];
  }
}

function markLegacyWishlistMigrated(userId: string): void {
  window.localStorage.setItem(`glitchprice-wishlist-migrated:${userId}`, "1");
}

function writeLocalWishlist(userId: string, wishlist: WishlistGame[]): void {
  window.localStorage.setItem(`glitchprice-wishlist:${userId}`, JSON.stringify(wishlist));
}

function addLocalWishlistItem(userId: string, item: WishlistGame): WishlistGame[] {
  const current = readLocalWishlist(userId);
  const existing = current.find((entry) => entry.gameId === item.gameId);
  const nextItem: WishlistGame = {
    ...existing,
    ...item,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    notificationEnabled: existing?.notificationEnabled ?? true,
    notificationPreferences: existing?.notificationPreferences
  };
  const wishlist = [nextItem, ...current.filter((entry) => entry.gameId !== item.gameId)];
  writeLocalWishlist(userId, wishlist);
  return wishlist;
}

function updateLocalWishlistItem(userId: string, gameId: string, updates: Partial<WishlistGame>): WishlistGame[] {
  const wishlist = readLocalWishlist(userId).map((item) => (item.gameId === gameId ? { ...item, ...updates } : item));
  writeLocalWishlist(userId, wishlist);
  return wishlist;
}

function removeLocalWishlistItem(userId: string, gameId: string): WishlistGame[] {
  try {
    const wishlist = readLocalWishlist(userId).filter((item) => item.gameId !== gameId);
    writeLocalWishlist(userId, wishlist);
    return wishlist;
  } catch {
    window.localStorage.removeItem(`glitchprice-wishlist:${userId}`);
    return [];
  }
}
