import { dataPath, readJson } from "./cache";
import type { GameSample, StoreId } from "./types";
import { STORES } from "./types";

export type MicrosoftDiscoveryState = {
  algorithmVersion?: number;
  matches: Record<string, string>;
  checkedAt: Record<string, string>;
};

export const MICROSOFT_DISCOVERY_VERSION = 2;

export function upgradeMicrosoftDiscoveryState(state: MicrosoftDiscoveryState): MicrosoftDiscoveryState {
  if (state.algorithmVersion === MICROSOFT_DISCOVERY_VERSION) return state;
  return { ...state, algorithmVersion: MICROSOFT_DISCOVERY_VERSION,
    checkedAt: Object.fromEntries(Object.entries(state.checkedAt).filter(([id]) => Boolean(state.matches[id]))) };
}

export const microsoftDiscoveryPath = () => dataPath("generated", "microsoft-discovery.json");
export const emptyMicrosoftDiscovery = (): MicrosoftDiscoveryState => ({ matches: {}, checkedAt: {} });

export async function withDiscoveredMicrosoftGames(sample: GameSample): Promise<GameSample> {
  const state = await readJson<MicrosoftDiscoveryState>(microsoftDiscoveryPath(), emptyMicrosoftDiscovery());
  return applyDiscoveredMicrosoftGames(sample, state);
}

export function applyDiscoveredMicrosoftGames(sample: GameSample, state: MicrosoftDiscoveryState): GameSample {
  const broadSample = sample.broadSample.map((game) => {
    const productId = state.matches[game.id];
    // Explicit curated mappings always win over automatic discovery.
    if (!productId || game.identifiers.microsoftProductId || game.identifiers.microsoftUrl) return game;
    const availableStores = [...new Set<StoreId>([...game.availableStores, "microsoft"])];
    return { ...game, identifiers: { ...game.identifiers, microsoftProductId: productId },
      expectedStores: [...new Set<StoreId>([...game.expectedStores, "microsoft"])],
      availableStores,
      comparisonStatus: game.comparisonStatus === "missing_some_stores" && availableStores.length === STORES.length ? "valid_all_stores" as const : game.comparisonStatus,
      missingStores: game.missingStores.filter((store) => store !== "microsoft") };
  });
  if (broadSample.every((game, index) => game === sample.broadSample[index])) return sample;
  const stores = STORES;
  return { ...sample, broadSample, strictSample: broadSample.filter((game) => game.availableStores.length === STORES.length),
    storeCoverage: Object.fromEntries(stores.map((store) => [store, broadSample.filter((game) => game.availableStores.includes(store)).length])),
    missingByStore: Object.fromEntries(stores.map((store) => [store, broadSample.filter((game) => game.missingStores.includes(store)).map((game) => game.title)])) };
}
