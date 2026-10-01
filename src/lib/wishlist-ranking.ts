export function rankWishlists(wishlists: Array<Array<{ gameId: string }>>) {
  const counts = new Map<string, number>();
  for (const wishlist of wishlists) {
    for (const gameId of new Set(wishlist.map((item) => item.gameId))) counts.set(gameId, (counts.get(gameId) ?? 0) + 1);
  }
  return [...counts].map(([gameId, saves]) => ({ gameId, saves })).sort((a, b) => b.saves - a.saves || a.gameId.localeCompare(b.gameId));
}
