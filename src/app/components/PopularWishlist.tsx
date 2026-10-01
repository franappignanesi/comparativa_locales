"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { PopularWishlistGame } from "@/lib/wishlist-popularity";

export function PopularWishlist({ onOpen }: { onOpen: (gameId: string) => void }) {
  const [games, setGames] = useState<PopularWishlistGame[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/wishlist/popular", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async (response) => {
      if (!response.ok) throw new Error("Ranking unavailable");
      const data = await response.json() as { games: PopularWishlistGame[] };
      setGames(data.games);
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section className="popularWishlist" aria-labelledby="popular-wishlist-title" aria-busy={loading}>
    <h2 id="popular-wishlist-title"><Star size={16} />Los más deseados de BARATEAM</h2>
    {loading ? <div className="popularWishlistList popularWishlistSkeleton" aria-label="Cargando los más deseados">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
      : games.length ? <ol className="popularWishlistList">{games.map((game, index) => <li key={game.gameId}>
        <a href={`/juegos/${game.gameId}`} onClick={(event) => {
          if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpen(game.gameId); }
        }}>
          <div className="popularWishlistCover">{game.coverUrl ? <img src={game.coverUrl} alt="" width={184} height={86} loading="lazy" /> : null}<span>{index + 1}</span></div>
          <strong>{game.title}</strong>
        </a>
      </li>)}</ol> : <p>El ranking de favoritos todavía no está disponible.</p>}
  </section>;
}
