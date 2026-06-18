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

  const games = candidates
    .filter((candidate) => {
      const badEdition = candidate.edition !== "standard";
      const noStore = candidate.expectedStores.length === 0;
      if (badEdition || noStore) {
        rejected.push({ title: candidate.title, reason: badEdition ? "Edición no estándar" : "Sin tiendas esperadas" });
        return false;
      }
      return true;
    })
    .map((candidate) => toSampleGame(candidate, manual.matches));

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
  const availableStores = STORES.filter((store) => hasStoreMatch(candidate, store, manualMatches));
  const missingStores = STORES.filter((store) => !availableStores.includes(store));
  const comparisonStatus = getComparisonStatus(candidate, availableStores, manualMatches);

  return {
    ...candidate,
    id: slugifyTitle(candidate.title),
    coverUrl: getCoverUrl(candidate),
    availableStores,
    missingStores,
    comparisonStatus
  };
}

function getCoverUrl(candidate: GameCandidate): string | null {
  const appId = candidate.identifiers.steamAppId;
  if (!appId) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
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
