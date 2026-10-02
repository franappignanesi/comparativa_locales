"use client";

import { ChevronLeft, ChevronRight, Leaf } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RegionId } from "@/lib/regions";

type CommunityGame = { gameId: string; title: string; coverUrl?: string | null; votes: number; discount: number; price: number; currency: string };
type CommunityData = { games: CommunityGame[]; counts: Record<string, number> };

export function useCommunityVotes(active: boolean, userSub: string | undefined, region: RegionId) {
  const [data, setData] = useState<CommunityData>({ games: [], counts: {} });
  const [votes, setVotes] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const identity = useRef(userSub);
  identity.current = userSub;
  useEffect(() => {
    setVotes([]); setReady(false);
    if (!active || !userSub) return;
    const controller = new AbortController();
    fetch("/api/user/offer-votes", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { if (!response.ok) throw Error("No pudimos cargar tus votos. Volvé a iniciar sesión o recargá la página."); return response.json(); })
      .then(result => { setVotes(result.votes); setReady(true); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [active, userSub, retry]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/offers/community?region=${region}&v=${version}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { if (!response.ok) throw Error("No pudimos cargar el ranking. Probá nuevamente en unos minutos."); return response.json(); })
      .then(setData)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, region, version]);
  async function toggle(gameId: string) {
    if (!userSub) { window.dispatchEvent(new Event("glitchprice-open-user-menu")); return; }
    if (!ready || busy.current) return;
    const voter = userSub;
    const voted = !votes.includes(gameId);
    if (voted && votes.length >= 5) { setError("Ya usaste tus cinco votos. Quitá una hoja para elegir otra oferta."); return; }
    busy.current = true; setPending(gameId); setError("");
    try {
      const response = await fetch("/api/user/offer-votes", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, voted, region }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (identity.current !== voter) return;
      if (result.votes) setVotes(result.votes);
      if (!response.ok) throw Error(result.message ?? "No pudimos guardar el voto.");
      setVersion(value => value + 1);
    } catch (reason) { if (identity.current === voter) setError(reason instanceof Error ? reason.message : "No pudimos guardar el voto."); }
    finally { busy.current = false; setPending(null); }
  }
  return { data, votes, ready, loading, error, pending, toggle, refresh: () => { setError(""); setVersion(value => value + 1); setRetry(value => value + 1); } };
}

export function OfferVoteButton({ voted, count, disabled, pending, onVote }: {
  voted: boolean; count: number; disabled?: boolean; pending?: boolean; onVote: () => void;
}) {
  const label = voted ? "Quitar mi voto" : "Votar esta oferta";
  return <button type="button" className={`offerVote${voted ? " active" : ""}`} title={`${label} · ${count} votos`}
    aria-label={`${label} (${count} votos)`} aria-pressed={voted} aria-busy={pending} disabled={disabled}
    onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onVote(); }}>
    <Leaf size={17} /><span>{count}</span>
  </button>;
}

export function CommunityOffers({ state, loggedIn, enabled, onOpen }: {
  state: ReturnType<typeof useCommunityVotes>; loggedIn: boolean; enabled: boolean; onOpen: (gameId: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  function updateEdges() {
    const element = rail.current;
    if (element) setEdges({ start: element.scrollLeft < 3, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 3 });
  }
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    element.scrollLeft = 0;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element); updateEdges();
    return () => observer.disconnect();
  }, [state.data.games]);
  function scroll(direction: number) {
    rail.current?.scrollBy({ left: direction * rail.current.clientWidth * .8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <section className="communityOffers" aria-labelledby="community-offers-title">
    <div className="communityHeading"><div><span className="autumnEyebrow">ELEGIDAS ENTRE TODOS</span>
      <h2 id="community-offers-title"><Leaf size={22} />Ofertas de la comunidad</h2>
      <p>Tenés cinco hojas para votar tus ofertas favoritas. Podés quitarlas y elegir otras: las más votadas aparecen acá.</p>
    </div><div className="communityControls"><span className="voteBudget"><Leaf size={15} />{loggedIn ? `${state.votes.length}/5` : "5 votos"}</span>
      <button type="button" aria-label="Ofertas anteriores" title="Ofertas anteriores" disabled={edges.start} onClick={() => scroll(-1)}><ChevronLeft size={20} /></button>
      <button type="button" aria-label="Ofertas siguientes" title="Ofertas siguientes" disabled={edges.end} onClick={() => scroll(1)}><ChevronRight size={20} /></button>
    </div></div>
    {state.error ? <p className="communityError" role="alert">{state.error} <button type="button" onClick={state.refresh}>Reintentar</button></p> : null}
    {!enabled ? <p>Activá Steam para ver las ofertas de la comunidad.</p> : state.loading ? <div className="communitySkeleton" aria-label="Cargando ofertas de la comunidad" aria-busy="true">{[0,1,2,3].map(value => <div key={value} />)}</div> :
      state.data.games.length ? <div className="communityRail" ref={rail} onScroll={updateEdges}>
        {state.data.games.slice(0, 10).map((game, index) => <article className="communityGame" key={game.gameId}>
          <a className="communityGameLink" href={`/juegos/${game.gameId}`} onClick={event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onOpen(game.gameId); }
          }}>
            <div className="communityCover">{game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy" /> : null}<span className="communityRank">#{index + 1}</span><span className="communityDiscount">-{game.discount}%</span></div>
            <h3>{game.title}</h3><div className="communityPrice"><strong>{game.currency} {new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(game.price)}</strong><span>Steam</span></div>
          </a><OfferVoteButton voted={state.votes.includes(game.gameId)} count={game.votes} disabled={!!state.pending || loggedIn && !state.ready} pending={state.pending === game.gameId} onVote={() => state.toggle(game.gameId)} />
        </article>)}
      </div> : !state.error ? <div className="communityEmpty"><Leaf size={28} /><p>El ranking arranca con vos. Votá con la hoja que aparece junto a la estrella en las ofertas.</p></div> : null}
  </section>;
}
