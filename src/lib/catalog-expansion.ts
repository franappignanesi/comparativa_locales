import type { GameCandidate } from "./types";
import { slugifyTitle } from "./sample-builder";

export const PACK_TITLE = /\b(collection|trilogy|anthology|complete (?:pack|edition|season)|ultimate collection|legacy collection|double pack|duology)\b/i;
export const EXCLUDED_PRODUCT = /\b(soundtrack|artbook|wallpaper|season pass|upgrade|dlc|demo|dedicated server|sdk|4[- ]pack|2[- ]pack)\b/i;

export function isPackTitle(title: string): boolean {
  return PACK_TITLE.test(title) && !/\[[^\]]*collection[^\]]*\]|collection version|entire collection|prime access/i.test(title);
}

export function catalogIdentity(game: GameCandidate): string {
  return game.identifiers.steamSubId ? `sub/${game.identifiers.steamSubId}` : `app/${game.identifiers.steamAppId}`;
}

export function normalizedCatalogTitle(title: string): string {
  return title.replace(/[™®©]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function chooseCatalogAdditions(candidates: GameCandidate[], existing: GameCandidate[], limit: number): GameCandidate[] {
  if (limit <= 0) return [];
  const ids = new Set(existing.map(catalogIdentity));
  const titles = new Set(existing.map(game => normalizedCatalogTitle(game.title)));
  const slugs = new Set(existing.map(game => slugifyTitle(game.title)));
  const selected: GameCandidate[] = [];
  let packCount = 0;
  let comparablePacks = 0;
  const existingPackCount = existing.filter(g => g.productKind === "pack").length;
  // Multi-store packs go first so the 70% floor holds for every published batch.
  const sorted = [...candidates].sort((a, b) => Number(b.productKind === "pack" && b.expectedStores.length > 1) - Number(a.productKind === "pack" && a.expectedStores.length > 1));
  for (const game of sorted) {
    const id = catalogIdentity(game);
    const title = normalizedCatalogTitle(game.title);
    const slug = slugifyTitle(game.title);
    if (!slug || !game.identifiers.itadId || ids.has(id) || titles.has(title) || slugs.has(slug) || EXCLUDED_PRODUCT.test(game.title)) continue;
    if (game.productKind === "pack") {
      if (existingPackCount + packCount >= 150) continue;
      const nextComparable = comparablePacks + Number(game.expectedStores.length > 1);
      if (nextComparable / (packCount + 1) < 0.7) continue;
      comparablePacks = nextComparable;
      packCount++;
    }
    selected.push(game);
    ids.add(id);
    titles.add(title);
    slugs.add(slug);
    if (selected.length >= limit) break;
  }
  return selected;
}
