import { unstable_cache } from "next/cache";
import { getWishlistRanking } from "./user-store";
import { getGameSample } from "./sample-builder";

export type PopularWishlistGame = { gameId: string; title: string; coverUrl: string | null };

export const getPopularWishlistGames = unstable_cache(async (): Promise<PopularWishlistGame[]> => {
  const [ranking, sample] = await Promise.all([getWishlistRanking(), getGameSample()]);
  const catalog = new Map(sample.broadSample.map((game) => [game.id, game]));
  return ranking.flatMap(({ gameId }) => {
    const game = catalog.get(gameId);
    return game ? [{ gameId, title: game.title, coverUrl: game.coverUrl ?? null }] : [];
  }).slice(0, 5);
}, ["public-wishlist-popularity-v1"], { revalidate: 3600 });
