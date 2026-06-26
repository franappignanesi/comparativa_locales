import { dataPath, readJson, writeJson } from "./cache";
import type {
  ComparisonStatus,
  GameCandidate,
  GameSample,
  ManualStoreMatch,
  SampleGame,
  StoreId
} from "./types";
import { STORES } from "./types";

type ManualMatchesFile = {
  matches: ManualStoreMatch[];
};

const emptySample: GameSample = {
  timestamp: null,
  strictSample: [],
  broadSample: [],
  rejected: [],
  missingByStore: {},
  storeCoverage: {},
  categoryCoverage: {}
};

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function buildGameSample(): Promise<GameSample> {
  const candidates = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const manual = await readJson<ManualMatchesFile>(dataPath("manual-store-matches.json"), { matches: [] });
  const rejected: GameSample["rejected"] = [];

  const games = dedupeSampleGamesById(candidates
    .filter((candidate) => {
      const badEdition = candidate.edition !== "standard";
      const noStore = candidate.expectedStores.length === 0;
      if (badEdition || noStore) {
        rejected.push({ title: candidate.title, reason: badEdition ? "Edición no estándar" : "Sin tiendas esperadas" });
        return false;
      }
      return true;
    })
    .map((candidate) => toSampleGame(candidate, manual.matches)));

  const strictSample = games.filter((game) => game.availableStores.length === STORES.length);
  const broadSample = games.filter((game) => game.availableStores.length > 0);
  const missingByStore = Object.fromEntries(
    STORES.map((store) => [store, broadSample.filter((game) => game.missingStores.includes(store)).map((game) => game.title)])
  ) as GameSample["missingByStore"];
  const storeCoverage = Object.fromEntries(
    STORES.map((store) => [store, broadSample.filter((game) => game.availableStores.includes(store)).length])
  ) as GameSample["storeCoverage"];
  const categoryCoverage = broadSample.reduce<GameSample["categoryCoverage"]>((acc, game) => {
    acc[game.category] = (acc[game.category] ?? 0) + 1;
    return acc;
  }, {});

  const sample: GameSample = {
    timestamp: new Date().toISOString(),
    strictSample,
    broadSample,
    rejected,
    missingByStore,
    storeCoverage,
    categoryCoverage
  };

  await writeJson(dataPath("generated", "game-sample.json"), sample);
  return sample;
}

export async function getGameSample(): Promise<GameSample> {
  const sample = await readJson<GameSample>(dataPath("generated", "game-sample.json"), emptySample);
  return sample.timestamp ? sample : buildGameSample();
}

function toSampleGame(candidate: GameCandidate, manualMatches: ManualStoreMatch[]): SampleGame {
  const enrichedCandidate = applyManualIdentifiers(candidate, manualMatches);
  const availableStores = STORES.filter((store) => hasStoreMatch(enrichedCandidate, store, manualMatches));
  const missingStores = STORES.filter((store) => !availableStores.includes(store));
  const comparisonStatus = getComparisonStatus(enrichedCandidate, availableStores, manualMatches);

  return {
    ...enrichedCandidate,
    id: slugifyTitle(enrichedCandidate.title),
    coverUrl: getCoverUrl(enrichedCandidate),
    availableStores,
    missingStores,
    comparisonStatus
  };
}

function dedupeSampleGamesById(games: SampleGame[]): SampleGame[] {
  const byId = new Map<string, SampleGame>();
  for (const game of games) {
    const current = byId.get(game.id);
    if (!current || scoreSampleGame(game) > scoreSampleGame(current)) byId.set(game.id, game);
  }
  return [...byId.values()];
}

function scoreSampleGame(game: SampleGame): number {
  return game.availableStores.length * 100 + (game.confidence === "high" ? 20 : game.confidence === "medium" ? 10 : 0);
}

function getCoverUrl(candidate: GameCandidate): string | null {
  if (candidate.coverUrl !== undefined) return candidate.coverUrl;
  const appId = candidate.identifiers.steamAppId;
  if (!appId) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

function applyManualIdentifiers(candidate: GameCandidate, manualMatches: ManualStoreMatch[]): GameCandidate {
  const matches = manualMatches.filter((match) => match.gameTitle.toLowerCase() === candidate.title.toLowerCase());
  if (!matches.length) return candidate;

  const identifiers = { ...candidate.identifiers };
  const expectedStores = new Set(candidate.expectedStores);

  for (const match of matches) {
    expectedStores.add(match.store);
    if (match.store === "steam") identifiers.steamAppId = Number(match.identifier) || identifiers.steamAppId;
    if (match.store === "epic") identifiers.epicSlug = match.identifier;
    if (match.store === "gog") identifiers.gogSlug = match.identifier;
    if (match.store === "humble") identifiers.humbleSlug = match.identifier;
    if (match.store === "microsoft") {
      if (/^https?:\/\//i.test(match.identifier)) identifiers.microsoftUrl = match.identifier;
      else identifiers.microsoftProductId = match.identifier;
    }
  }

  return {
    ...candidate,
    expectedStores: [...expectedStores],
    identifiers
  };
}

function hasStoreMatch(candidate: GameCandidate, store: StoreId, manualMatches: ManualStoreMatch[]): boolean {
  const manual = manualMatches.some(
    (match) => match.store === store && match.gameTitle.toLowerCase() === candidate.title.toLowerCase()
  );
  if (manual) return true;
  if (candidate.expectedStores.includes(store)) return true;
  if (store === "steam") return Boolean(candidate.identifiers.steamAppId);
  if (store === "epic") return Boolean(candidate.identifiers.epicSlug);
  if (store === "gog") return Boolean(candidate.identifiers.gogSlug);
  if (store === "humble") return Boolean(candidate.identifiers.humbleSlug);
  return Boolean(candidate.identifiers.microsoftUrl);
}

function getComparisonStatus(
  candidate: GameCandidate,
  availableStores: StoreId[],
  manualMatches: ManualStoreMatch[]
): ComparisonStatus {
  const hasManualEditionNote = manualMatches.some(
    (match) =>
      match.gameTitle.toLowerCase() === candidate.title.toLowerCase() &&
      match.edition &&
      match.edition.toLowerCase() !== "standard"
  );
  if (hasManualEditionNote) return "edition_mismatch";
  if (candidate.confidence === "low") return "manual_review_needed";
  if (candidate.confidence === "medium") return "uncertain_match";
  if (availableStores.length === STORES.length) return "valid_all_stores";
  return "missing_some_stores";
}
