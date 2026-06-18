export type StoreId = "steam" | "epic" | "gog" | "humble" | "microsoft";

export const STORES: StoreId[] = ["steam", "epic", "gog", "humble", "microsoft"];

export type ComparisonStatus =
  | "valid_all_stores"
  | "missing_some_stores"
  | "edition_mismatch"
  | "uncertain_match"
  | "manual_review_needed";

export type GameCategory =
  | "AAA nuevo"
  | "AAA viejo"
  | "indie popular"
  | "AA"
  | "clásico"
  | "Microsoft/Xbox"
  | "multiplayer pago";

export type StoreIdentifiers = {
  steamAppId?: number | null;
  epicSlug?: string | null;
  gogSlug?: string | null;
  humbleSlug?: string | null;
  microsoftProductId?: string | null;
  microsoftUrl?: string | null;
};

export type GameCandidate = {
  title: string;
  edition: "standard";
  category: GameCategory;
  primaryTag?: string | null;
  steamTags?: string[];
  releaseYear: number;
  notes: string;
  expectedStores: StoreId[];
  identifiers: StoreIdentifiers;
  confidence: "high" | "medium" | "low";
};

export type SampleGame = GameCandidate & {
  id: string;
  coverUrl?: string | null;
  availableStores: StoreId[];
  missingStores: StoreId[];
  comparisonStatus: ComparisonStatus;
};

export type GameSample = {
  timestamp: string | null;
  strictSample: SampleGame[];
  broadSample: SampleGame[];
  rejected: Array<{ title: string; reason: string }>;
  missingByStore: Partial<Record<StoreId, string[]>>;
  storeCoverage: Partial<Record<StoreId, number>>;
  categoryCoverage: Partial<Record<GameCategory, number>>;
  notes?: string;
};

export type StorePrice = {
  store: StoreId;
  title: string;
  available: boolean;
  basePrice: number | null;
  finalPrice: number | null;
  currency: string | null;
  discountPct: number | null;
  url: string | null;
  raw: unknown;
  error?: string;
  source?: "live" | "manual" | "cache" | "unavailable" | "itad" | "steamspy";
  fetchedAt?: string | null;
  isStale?: boolean;
  staleReason?: string | null;
};

export type NormalizedPrice = StorePrice & {
  originalCurrency: string | null;
  originalFinalPrice: number | null;
  originalBasePrice: number | null;
  arsConvertedFinalPrice: number | null;
  arsConvertedBasePrice: number | null;
  arsFinalPrice: number | null;
  arsBasePrice: number | null;
};

export type LatestPrices = {
  timestamp: string | null;
  region?: string;
  currency?: string;
  locale?: string;
  usdToArs: number;
  usdToArsSource?: string;
  usdToArsTimestamp?: string | null;
  digitalVatRate?: number;
  prices: Array<{
    gameId: string;
    gameTitle: string;
    coverUrl?: string | null;
    primaryTag?: string | null;
    category: GameCategory;
    releaseYear: number;
    comparisonStatus: ComparisonStatus;
    prices: Partial<Record<StoreId, NormalizedPrice>>;
  }>;
  errors: Array<{ gameId: string; store: StoreId; error: string }>;
  notes?: string;
};

export type PriceHistoryEntry = {
  gameId: string;
  gameTitle: string;
  store: StoreId;
  timestamp: string;
  originalCurrency: string | null;
  originalFinalPrice: number | null;
  originalBasePrice: number | null;
  arsFinalPrice: number | null;
  arsBasePrice: number | null;
  discountPct: number | null;
  url: string | null;
  source: "snapshot" | "itad";
};

export type HistoricalLow = PriceHistoryEntry & {
  currentDifferencePct: number | null;
  currentDifferenceArs: number | null;
};

export type PriceHistoryReport = {
  timestamp: string | null;
  ownHistoryStartedAt: string | null;
  ownSnapshots: number;
  itad: {
    enabled: boolean;
    timestamp: string | null;
    source: string;
    matchedGames: number;
    errors: string[];
  };
  lowsByGame: Record<string, Partial<Record<StoreId, HistoricalLow>>>;
  entriesByGame: Record<string, PriceHistoryEntry[]>;
};

export type ManualPrice = {
  gameTitle: string;
  store: StoreId;
  title?: string;
  available: boolean;
  basePrice: number | null;
  finalPrice: number | null;
  currency: string | null;
  discountPct?: number | null;
  url?: string | null;
  capturedAt?: string;
  notes?: string;
};

export type ManualPricesFile = {
  updatedAt: string | null;
  sourceNotes?: string;
  prices: ManualPrice[];
};

export type ManualStoreMatch = {
  gameTitle: string;
  store: StoreId;
  identifier: string;
  edition?: string;
  notes?: string;
};
