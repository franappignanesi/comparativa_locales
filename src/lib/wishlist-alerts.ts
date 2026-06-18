import { dataPath, writeJson } from "./cache";
import { getPriceHistoryReport } from "./history";
import { getLatestPrices } from "./prices";
import { DEFAULT_REGION, type RegionId } from "./regions";
import { getAllUsersWithWishlists, getNotificationSettings, getWishlist, type StoredWishlistItem } from "./user-store";
import type { LatestPrices, PriceHistoryEntry, StoreId } from "./types";
import { STORES } from "./types";

export type WishlistAlertType = "price_drop" | "below_usd" | "historical_low";

export type WishlistAlert = {
  userId: string;
  region: RegionId;
  gameId: string;
  gameTitle: string;
  store: StoreId;
  type: WishlistAlertType;
  message: string;
  triggeredAt: string;
  currentOfficialPrice: number | null;
  currentCurrency: string | null;
  currentArsPrice: number | null;
  previousArsPrice?: number | null;
  thresholdUsd?: number | null;
};

export type WishlistAlertReport = {
  timestamp: string;
  alerts: WishlistAlert[];
  usersChecked: number;
  regionsChecked: RegionId[];
};

const STORE_LABELS: Record<StoreId, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft"
};

export async function getWishlistAlertsForUser(userId: string, region: RegionId = DEFAULT_REGION): Promise<WishlistAlert[]> {
  const wishlist = await getWishlist(userId);
  return evaluateWishlistAlerts(userId, wishlist, region);
}

export async function evaluateAllWishlistAlerts(regions: RegionId[] = [DEFAULT_REGION]): Promise<WishlistAlertReport> {
  const users = await getAllUsersWithWishlists();
  const alerts: WishlistAlert[] = [];
  for (const region of regions) {
    for (const { user, wishlist } of users) {
      alerts.push(...(await evaluateWishlistAlerts(user.sub, wishlist, region)));
    }
  }
  const report = {
    timestamp: new Date().toISOString(),
    alerts,
    usersChecked: users.length,
    regionsChecked: regions
  };
  await writeJson(dataPath("generated", "wishlist-alerts.json"), report);
  return report;
}

async function evaluateWishlistAlerts(userId: string, wishlist: StoredWishlistItem[], region: RegionId): Promise<WishlistAlert[]> {
  const enabledWishlist = wishlist.filter((item) => item.notificationEnabled);
  if (!enabledWishlist.length) return [];
  const notificationSettings = await getNotificationSettings(userId);
  const enabledStores = new Set(notificationSettings.enabledStores?.length ? notificationSettings.enabledStores : STORES);

  const latest = await getLatestPrices({ region });
  const gameIds = new Set(enabledWishlist.map((item) => item.gameId));
  const history = await getPriceHistoryReport(latest, { gameIds });
  const rowsById = new Map(latest.prices.map((row) => [row.gameId, row]));
  const alerts: WishlistAlert[] = [];

  for (const item of enabledWishlist) {
    const row = rowsById.get(item.gameId);
    if (!row) continue;
    const entries = history.entriesByGame[item.gameId] ?? [];
    const preferences = item.notificationPreferences;
    for (const store of STORES) {
      if (!enabledStores.has(store)) continue;
      const price = row.prices[store];
      if (!price?.available || price.arsFinalPrice == null) continue;

      if (preferences.priceDrop) {
        const previous = findPreviousSnapshot(entries, store, latest);
        if (previous?.arsFinalPrice != null && previous.arsFinalPrice > price.arsFinalPrice) {
          const pct = Math.round((1 - price.arsFinalPrice / previous.arsFinalPrice) * 100);
          alerts.push(buildAlert(userId, region, row, store, "price_drop", `Bajó ${pct}% en ${STORE_LABELS[store]}`, price, previous.arsFinalPrice));
        }
      }

      if (preferences.belowUsd && preferences.belowUsdValue != null && price.originalCurrency === "USD" && (price.originalFinalPrice ?? Infinity) <= preferences.belowUsdValue) {
        alerts.push(
          buildAlert(
            userId,
            region,
            row,
            store,
            "below_usd",
            `Bajó de USD ${formatUsd(preferences.belowUsdValue)} en ${STORE_LABELS[store]}`,
            price,
            null,
            preferences.belowUsdValue
          )
        );
      }

      if (preferences.historicalLow && equalsOrBreaksPreviousLow(entries, store, latest, price.arsFinalPrice)) {
        alerts.push(buildAlert(userId, region, row, store, "historical_low", `Igualó/perforó el mínimo histórico en ${STORE_LABELS[store]}`, price));
      }
    }
  }

  return dedupeAlerts(alerts);
}

function findPreviousSnapshot(entries: PriceHistoryEntry[], store: StoreId, latest: LatestPrices): PriceHistoryEntry | null {
  const latestTime = latest.timestamp ? Date.parse(latest.timestamp) : Date.now();
  return (
    entries
      .filter((entry) => entry.store === store && entry.source === "snapshot" && entry.arsFinalPrice != null && Date.parse(entry.timestamp) < latestTime)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null
  );
}

function equalsOrBreaksPreviousLow(entries: PriceHistoryEntry[], store: StoreId, latest: LatestPrices, current: number): boolean {
  const latestTime = latest.timestamp ? Date.parse(latest.timestamp) : Date.now();
  const previousValues = entries
    .filter((entry) => entry.store === store && entry.arsFinalPrice != null && Date.parse(entry.timestamp) < latestTime)
    .map((entry) => entry.arsFinalPrice as number);
  if (!previousValues.length) return false;
  return current <= Math.min(...previousValues);
}

function buildAlert(
  userId: string,
  region: RegionId,
  row: LatestPrices["prices"][number],
  store: StoreId,
  type: WishlistAlertType,
  message: string,
  price: NonNullable<LatestPrices["prices"][number]["prices"][StoreId]>,
  previousArsPrice: number | null = null,
  thresholdUsd: number | null = null
): WishlistAlert {
  return {
    userId,
    region,
    gameId: row.gameId,
    gameTitle: row.gameTitle,
    store,
    type,
    message,
    triggeredAt: new Date().toISOString(),
    currentOfficialPrice: price.originalFinalPrice,
    currentCurrency: price.originalCurrency,
    currentArsPrice: price.arsFinalPrice,
    previousArsPrice,
    thresholdUsd
  };
}

function dedupeAlerts(alerts: WishlistAlert[]): WishlistAlert[] {
  const priority: Record<WishlistAlertType, number> = {
    price_drop: 3,
    historical_low: 2,
    below_usd: 1
  };
  const byGame = new Map<string, WishlistAlert>();
  for (const alert of alerts) {
    const existing = byGame.get(alert.gameId);
    if (!existing || priority[alert.type] > priority[existing.type]) byGame.set(alert.gameId, alert);
  }
  return [...byGame.values()];
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
