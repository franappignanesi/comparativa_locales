import type { LatestPrices, NormalizedPrice, StoreId } from "./types";
import { STORES } from "./types";

export type GameAnalysis = {
  gameId: string;
  winner: StoreId | null;
  winnerPrice: number | null;
  differenceVsSteam: number | null;
  priceIndex: Partial<Record<StoreId, number | null>>;
  coverage: number;
  needsReview: boolean;
};

export type AnalysisSummary = {
  cheapestAverageStore: StoreId | null;
  mostWinsStore: StoreId | null;
  averageSavingsVsSteam: number | null;
  gamesAnalyzed: number;
  completeDataGames: number;
  missingDataGames: number;
  averageByStore: Partial<Record<StoreId, number | null>>;
  medianByStore: Partial<Record<StoreId, number | null>>;
  winsByStore: Partial<Record<StoreId, number>>;
  discountedWinsByStore: Partial<Record<StoreId, number>>;
  nonDiscountedWinsByStore: Partial<Record<StoreId, number>>;
  priceIndexByStore: Partial<Record<StoreId, number | null>>;
  offersByStore: Partial<Record<StoreId, number>>;
  averageDiscountByStore: Partial<Record<StoreId, number | null>>;
  coverageByStore: Partial<Record<StoreId, number>>;
  bestDifferences: GameAnalysis[];
  reviewCases: GameAnalysis[];
  games: Record<string, GameAnalysis>;
};

export function analyzePrices(latest: LatestPrices, gameIds?: Set<string>, stores: StoreId[] = STORES): AnalysisSummary {
  const rows = gameIds ? latest.prices.filter((row) => gameIds.has(row.gameId)) : latest.prices;
  const games: Record<string, GameAnalysis> = {};
  const winsByStore = makeStoreRecord(0);
  const discountedWinsByStore = makeStoreRecord(0);
  const nonDiscountedWinsByStore = makeStoreRecord(0);
  const valuesByStore = makeStoreRecord<number[]>([]);
  const indexValuesByStore = makeStoreRecord<number[]>([]);
  const discountsByStore = makeStoreRecord<number[]>([]);
  const offersByStore = makeStoreRecord(0);
  const coverageByStore = makeStoreRecord(0);
  const savings: number[] = [];
  let pricedGames = 0;

  for (const row of rows) {
    const priced = stores.map((store) => row.prices[store]).filter(hasArsPrice);
    const comparable = priced.length >= 2;
    if (priced.length > 0) pricedGames += 1;

    const priceIndex = makeStoreRecord<number | null>(null);
    const winnerPrice = priced.length > 0 ? Math.min(...priced.map((price) => price.arsFinalPrice)) : null;
    const winner = winnerPrice == null ? null : priced.find((price) => price.arsFinalPrice === winnerPrice)?.store ?? null;

    for (const store of stores) {
      const price = row.prices[store];
      if (hasArsPrice(price)) {
        valuesByStore[store].push(price.arsFinalPrice);
        coverageByStore[store] += 1;
      }
      if (isDiscounted(price)) {
        offersByStore[store] += 1;
        discountsByStore[store].push(price.discountPct ?? inferredDiscountPct(price) ?? 0);
      }
    }

    if (comparable) {
      if (winner) winsByStore[winner] += 1;
      if (winner) {
        if (isDiscounted(row.prices[winner])) discountedWinsByStore[winner] += 1;
        else nonDiscountedWinsByStore[winner] += 1;
      }

      if (winnerPrice != null && winnerPrice > 0) {
        for (const price of priced) {
          const index = Math.round((price.arsFinalPrice / winnerPrice - 1) * 100);
          priceIndex[price.store] = index;
          indexValuesByStore[price.store].push(index);
        }
      }
    }

    const steam = stores.includes("steam") ? row.prices.steam : undefined;
    const differenceVsSteam =
      winnerPrice != null && hasArsPrice(steam) ? winnerPrice - steam.arsFinalPrice : null;
    if (differenceVsSteam != null && differenceVsSteam < 0) savings.push(Math.abs(differenceVsSteam));

    games[row.gameId] = {
      gameId: row.gameId,
      winner,
      winnerPrice,
      differenceVsSteam,
      priceIndex,
      coverage: priced.length,
      needsReview:
        row.comparisonStatus === "edition_mismatch" ||
        row.comparisonStatus === "manual_review_needed" ||
        row.comparisonStatus === "uncertain_match" ||
        Object.values(row.prices).some((price) => price?.available && price.arsFinalPrice == null)
    };
  }

  const averageByStore = mapStoreNumbers(valuesByStore, average);
  const medianByStore = mapStoreNumbers(valuesByStore, median);
  const priceIndexByStore = normalizeStoreIndex(mapStoreNumbers(indexValuesByStore, average));
  const averageDiscountByStore = mapStoreNumbers(discountsByStore, average);
  const cheapestAverageStore = minStore(averageByStore, stores);
  const mostWinsStore = maxStore(winsByStore, stores);
  const gameAnalyses = Object.values(games);

  return {
    cheapestAverageStore,
    mostWinsStore,
    averageSavingsVsSteam: average(savings),
    gamesAnalyzed: pricedGames,
    completeDataGames: gameAnalyses.filter((game) => game.coverage === stores.length).length,
    missingDataGames: gameAnalyses.filter((game) => game.coverage >= 1 && game.coverage < stores.length).length,
    averageByStore,
    medianByStore,
    winsByStore,
    discountedWinsByStore,
    nonDiscountedWinsByStore,
    priceIndexByStore,
    offersByStore,
    averageDiscountByStore,
    coverageByStore,
    bestDifferences: gameAnalyses
      .filter((game) => game.differenceVsSteam != null)
      .sort((a, b) => (a.differenceVsSteam ?? 0) - (b.differenceVsSteam ?? 0))
      .slice(0, 10),
    reviewCases: gameAnalyses.filter((game) => game.needsReview).slice(0, 20),
    games
  };
}

function hasArsPrice(price: NormalizedPrice | undefined): price is NormalizedPrice & { arsFinalPrice: number } {
  return Boolean(price?.available && price.arsFinalPrice != null);
}

function isDiscounted(price: NormalizedPrice | undefined): price is NormalizedPrice {
  return Boolean(price?.available && ((price.discountPct ?? 0) > 0 || hasBaseDiscount(price)));
}

function hasBaseDiscount(price: NormalizedPrice): boolean {
  return price.arsBasePrice != null && price.arsFinalPrice != null && price.arsBasePrice > price.arsFinalPrice;
}

function inferredDiscountPct(price: NormalizedPrice): number | null {
  if (price.arsBasePrice == null || price.arsFinalPrice == null || price.arsBasePrice <= price.arsFinalPrice) return null;
  return Math.round((1 - price.arsFinalPrice / price.arsBasePrice) * 100);
}

function makeStoreRecord<T>(initial: T): Record<StoreId, T> {
  return {
    steam: cloneInitial(initial),
    epic: cloneInitial(initial),
    gog: cloneInitial(initial),
    humble: cloneInitial(initial),
    microsoft: cloneInitial(initial)
  };
}

function cloneInitial<T>(value: T): T {
  return Array.isArray(value) ? ([...value] as T) : value;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function mapStoreNumbers(
  valuesByStore: Record<StoreId, number[]>,
  reducer: (values: number[]) => number | null
): Partial<Record<StoreId, number | null>> {
  return Object.fromEntries(STORES.map((store) => [store, reducer(valuesByStore[store])]));
}

function normalizeStoreIndex(values: Partial<Record<StoreId, number | null>>): Partial<Record<StoreId, number | null>> {
  const validValues = STORES.map((store) => values[store]).filter((value): value is number => value != null);
  if (!validValues.length) return values;
  const baseline = Math.min(...validValues);
  return Object.fromEntries(
    STORES.map((store) => [store, values[store] == null ? null : Math.max(0, (values[store] ?? 0) - baseline)])
  );
}

function minStore(values: Partial<Record<StoreId, number | null>>, stores: StoreId[]): StoreId | null {
  return [...stores].filter((store) => values[store] != null).sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0))[0] ?? null;
}

function maxStore(values: Partial<Record<StoreId, number>>, stores: StoreId[]): StoreId | null {
  const winner = [...stores].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0))[0] ?? null;
  return winner && (values[winner] ?? 0) > 0 ? winner : null;
}
