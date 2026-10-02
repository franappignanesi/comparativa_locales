"use client";

import {
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  Flame,
  History,
  Library,
  Rocket,
  Search,
  SlidersHorizontal,
  Star,
  TrendingDown,
  Leaf,
  Play,
  ShieldAlert,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ReleaseBadge } from "@/app/components/ReleaseBadge";
import { MobilePrimaryNav } from "@/app/components/MobilePrimaryNav";
import { LegalLinks } from "@/app/components/LegalLinks";
import { useRouter, useSearchParams } from "next/navigation";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu, WishlistGame } from "@/app/components/UserMenu";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import {
  addWishlistItem,
  DEFAULT_NOTIFICATION_SETTINGS,
  deleteWishlistItem,
  fetchNotificationSettings,
  fetchWishlist,
  fetchWishlistAlerts,
  persistSession,
  readStoredUser,
  type WishlistAlert
} from "@/app/components/userPersistence";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { isAdminEmail } from "@/lib/admin";
import type { AnalysisSummary, GameAnalysis } from "@/lib/analysis";
import { formatGameCategory } from "@/lib/categories";
import { FALLBACK_USD_TO_ARS, formatArs } from "@/lib/normalize";
import { STORE_LOGOS } from "@/lib/store-assets";
import { GameCover } from "@/app/components/GameCover";
import type { LatestPrices, NormalizedPrice, PriceHistoryReport, StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";
import { historyChartObservations } from "@/lib/history-chart";
import type { CatalogResponse } from "@/lib/catalog";
import { WEEKEND_FILTER } from "@/lib/weekend-games";
import { WeekendRecommendation, WeekendTag } from "@/app/components/WeekendRecommendation";
import { WeekendShowcase } from "@/app/components/WeekendShowcase";
import { PopularWishlist } from "@/app/components/PopularWishlist";
import { AutumnNavLink } from "@/app/components/AutumnNavLink";
import { AUTUMN_FILTER, steamAtHistoricalLow, steamOfferDiscount } from "@/lib/autumn-offers";
import { CommunityOffers, OfferVoteButton, useCommunityVotes } from "@/app/components/CommunityOffers";
import { AutumnLeaves } from "@/app/components/AutumnLeaves";

type ApiPayload = {
  autumnSelection?: CatalogResponse["autumnSelection"];
  featuredWeekend?: CatalogResponse["featuredWeekend"];
  weekend?: CatalogResponse["weekend"];
  latest: LatestPrices;
  history: PriceHistoryReport;
  analysis: {
    strict: AnalysisSummary;
    broad: AnalysisSummary;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  sampleMeta: {
    strictTotal: number;
    broadTotal: number;
    rejectedTotal: number;
  };
};

type PriceRow = LatestPrices["prices"][number];

type SidebarItem = {
  label: string;
  icon: LucideIcon;
  filter: string;
  sort: string;
  featured?: boolean;
};

const STORE_LABELS: Record<StoreId, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft"
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Ofertas 🎁", icon: Flame, filter: "ofertas", sort: "descuento" },
  { label: "Más baratos que Steam 👀", icon: TrendingDown, filter: "diferencias", sort: "diferencia" },
  { label: "Mínimos históricos 📉", icon: History, filter: "historicos", sort: "diferencia" }
];

const STEAM_CATEGORY_FILTERS = [
  { value: "Action", label: "Acción", icon: Rocket },
  { value: "Adventure", label: "Aventura", icon: History },
  { value: "RPG", label: "RPG", icon: Star },
  { value: "Strategy", label: "Estrategia", icon: BarChart3 },
  { value: "Simulation", label: "Simulación", icon: SlidersHorizontal },
  { value: "Indie", label: "Indie", icon: Leaf }
];
const CATALOG_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 250;

export function BibliotecaClient({ initialPayload, initialFilter = "todos", initialSort = "diferencia" }: { initialPayload: ApiPayload | null; initialFilter?: string; initialSort?: string }) {
  const [search, setSearch] = useState("");
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  return (
    <>
      <Suspense fallback={null}><BibliotecaQuerySync onChange={setSearch} /></Suspense>
      <BibliotecaContent initialPayload={initialPayload} initialFilter={initialFilter} initialSort={initialSort} searchParams={searchParams} />
    </>
  );
}

function BibliotecaQuerySync({ onChange }: { onChange: (search: string) => void }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  useEffect(() => onChange(search), [search, onChange]);
  return null;
}

function BibliotecaContent({ initialPayload, initialFilter, initialSort, searchParams }: { initialPayload: ApiPayload | null; initialFilter: string; initialSort: string; searchParams: URLSearchParams }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ApiPayload | null>(initialPayload);
  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("query") ?? "");
  const [category, setCategory] = useState("todas");
  const [filter, setFilter] = useState(searchParams.get("filter") ?? initialFilter);
  const [sort, setSort] = useState(searchParams.get("sort") ?? initialSort);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(true);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [autumnExpanded, setAutumnExpanded] = useState(false);
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [loading, setLoading] = useState(!initialPayload);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showWeekendVideo, setShowWeekendVideo] = useState(false);
  const [extraSelectedRow, setExtraSelectedRow] = useState<PriceRow | null>(null);
  const [openingWeekendGame, setOpeningWeekendGame] = useState(false);
  const [weekendOpenError, setWeekendOpenError] = useState(false);
  const weekendRequestRef = useRef<AbortController | null>(null);
  const urlGameAttemptRef = useRef("");
  const [loadingGameHistoryId, setLoadingGameHistoryId] = useState<string | null>(null);
  const historyAttemptsRef = useRef(new Set<string>());
  const initialPayloadRef = useRef(
    Boolean(initialPayload) && !searchParams.has("query") && !searchParams.has("filter") && !searchParams.has("sort") && !searchParams.has("game")
  );
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [wishlistAlerts, setWishlistAlerts] = useState<WishlistAlert[]>([]);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>([...STORES]);
  const communityVotes = useCommunityVotes(filter === AUTUMN_FILTER, user?.sub, region);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobileFilters(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setQuery(searchParams.get("query") ?? "");
    setDebouncedQuery(searchParams.get("query") ?? "");
    setFilter(searchParams.get("filter") ?? initialFilter);
    setSort(searchParams.get("sort") ?? initialSort);
  }, [searchParams, initialFilter, initialSort]);

  useEffect(() => {
    const saved = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (saved) setRegion(saved);
    const savedUser = readStoredUser();
    if (savedUser) setUser(savedUser);
  }, []);

  useEffect(() => {
    if (!user) {
      setWishlist([]);
      setWishlistAlerts([]);
      setEnabledStores((current) => current.length === STORES.length && STORES.every((store) => current.includes(store)) ? current : [...STORES]);
      return;
    }
    fetchWishlist(user.sub).then(setWishlist);
    fetchWishlistAlerts(user.sub, region).then(setWishlistAlerts);
    fetchNotificationSettings(user.sub).then((settings) =>
      setEnabledStores(settings.enabledStores?.length ? settings.enabledStores : [...STORES])
    );
  }, [user, region]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (initialPayloadRef.current) {
      initialPayloadRef.current = false;
      return;
    }
    setLoading(true);
    urlGameAttemptRef.current = "";
    setExtraSelectedRow(null);
    setSelectedGameId(null);
    weekendRequestRef.current?.abort();
    setOpeningWeekendGame(false);
    const controller = new AbortController();
    fetchCatalog({ offset: 0, signal: controller.signal })
      .then(setPayload)
      .catch((error) => { if (error.name !== "AbortError") console.error(error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, category, filter, sort, region, enabledStores]);

  useEffect(() => {
    const selectedFromUrl = searchParams.get("game");
    if (!payload || !selectedFromUrl || loading || urlGameAttemptRef.current === `${region}:${selectedFromUrl}`) return;
    urlGameAttemptRef.current = `${region}:${selectedFromUrl}`;
    const row = payload.latest.prices.find((game) => game.gameId === selectedFromUrl);
    if (row) setSelectedGameId(row.gameId);
    else if (filter === WEEKEND_FILTER) {
      void openWeekendGame(selectedFromUrl);
    }
  }, [payload, searchParams, region, loading]);

  useEffect(() => () => weekendRequestRef.current?.abort(), []);

  const games = payload?.latest.prices ?? [];

  useEffect(() => {
    if (!selectedGameId || !payload) return;
    const attemptKey = `${region}:${selectedGameId}`;
    if (historyAttemptsRef.current.has(attemptKey)) return;
    historyAttemptsRef.current.add(attemptKey);
    const controller = new AbortController();
    setLoadingGameHistoryId(selectedGameId);
    fetch(`/api/history?region=${region}&gameId=${selectedGameId}&full=1`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`history_${res.status}`);
        return res.json();
      })
      .then((history: PriceHistoryReport) => {
        setPayload((current) =>
          current
            ? {
                ...current,
                history: {
                  ...current.history,
                  lowsByGame: { ...current.history.lowsByGame, ...history.lowsByGame },
                  entriesByGame: { ...current.history.entriesByGame, ...history.entriesByGame }
                }
              }
            : current
        );
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          historyAttemptsRef.current.delete(attemptKey);
          console.error(error);
        }
      })
      .finally(() => {
        historyAttemptsRef.current.delete(attemptKey);
        if (!controller.signal.aborted) setLoadingGameHistoryId(null);
      });
    return () => controller.abort();
  }, [selectedGameId, region]);

  useEffect(() => {
    if (!showWeekendVideo || !selectedGameId) return;
    document.querySelector(".gameModal .weekendRecommendation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowWeekendVideo(false);
  }, [selectedGameId, showWeekendVideo]);

  if (!payload) {
    return <BibliotecaLoading />;
  }

  const summary = payload.analysis.broad;
  const selectedRow = selectedGameId ? payload.latest.prices.find((row) => row.gameId === selectedGameId) ?? payload.autumnSelection?.find(row => row.gameId === selectedGameId) ?? (payload.featuredWeekend?.gameId === selectedGameId ? payload.featuredWeekend : null) ?? (extraSelectedRow?.gameId === selectedGameId ? extraSelectedRow : null) : null;
  const autumn = filter === AUTUMN_FILTER;
  const queryActive = query.trim().length > 0;
  const searchPending = query.trim() !== debouncedQuery.trim() || loading;

  async function openWeekendGame(gameId: string, gameFilter = WEEKEND_FILTER) {
    const existing = payload?.latest.prices.find((row) => row.gameId === gameId) ?? (payload?.featuredWeekend?.gameId === gameId ? payload.featuredWeekend : null);
    if (existing) { setSelectedGameId(gameId); return; }
    weekendRequestRef.current?.abort();
    const controller = new AbortController();
    weekendRequestRef.current = controller;
    setOpeningWeekendGame(true);
    setWeekendOpenError(false);
    try {
      const params = new URLSearchParams({ filter: gameFilter, gameId, region, stores: enabledStores.join(","), limit: "1" });
      const response = await fetch(`/api/catalog?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("weekend_game_failed");
      const result = await response.json() as ApiPayload;
      const row = result.latest.prices[0];
      if (!row) throw new Error("weekend_game_missing");
      setExtraSelectedRow(row);
      setSelectedGameId(gameId);
      setPayload((current) => current ? { ...current, history: { ...current.history, lowsByGame: { ...current.history.lowsByGame, ...result.history.lowsByGame } } } : current);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setWeekendOpenError(true);
      else urlGameAttemptRef.current = "";
    } finally { if (!controller.signal.aborted) setOpeningWeekendGame(false); }
  }

  async function fetchCatalog(options: { offset: number; refresh?: boolean; signal?: AbortSignal }): Promise<ApiPayload> {
    const params = new URLSearchParams({
      mode: "broad",
      query: debouncedQuery,
      category,
      filter,
      sort,
      region,
      stores: enabledStores.join(","),
      limit: String(CATALOG_PAGE_SIZE),
      offset: String(options.offset)
    });
    if (options.refresh) params.set("refresh", "1");
    return fetch(`/api/catalog?${params.toString()}`, { signal: options.signal }).then((res) => {
      if (!res.ok) throw new Error("catalog_failed");
      return res.json();
    });
  }

  async function loadMore() {
    const currentPayload = payload;
    if (!currentPayload?.pagination.hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPayload = await fetchCatalog({ offset: currentPayload.latest.prices.length });
    setPayload({
      ...nextPayload,
      latest: {
        ...nextPayload.latest,
        prices: [...currentPayload.latest.prices, ...nextPayload.latest.prices]
      },
      history: {
        ...nextPayload.history,
        lowsByGame: { ...currentPayload.history.lowsByGame, ...nextPayload.history.lowsByGame },
        entriesByGame: { ...currentPayload.history.entriesByGame, ...nextPayload.history.entriesByGame }
      },
      analysis: {
        broad: {
          ...nextPayload.analysis.broad,
          games: { ...currentPayload.analysis.broad.games, ...nextPayload.analysis.broad.games }
        },
        strict: nextPayload.analysis.strict
      },
      pagination: nextPayload.pagination
    });
    setLoadingMore(false);
  }

  function activateSidebar(item: (typeof SIDEBAR_ITEMS)[number]) {
    navigateFilter(filter === item.filter && sort === item.sort ? "todos" : item.filter, item.sort);
    setCategory("todas");
  }

  function navigateFilter(nextFilter: string, nextSort = nextFilter === AUTUMN_FILTER ? "relevancia" : sort) {
    setFilter(nextFilter);
    setSort(nextSort);
    const path = nextFilter === AUTUMN_FILTER ? "/ofertas-de-otono" : nextFilter === WEEKEND_FILTER ? "/biblioteca/juego-del-finde" : "/biblioteca";
    const params = new URLSearchParams({ filter: nextFilter, sort: nextSort });
    if (query.trim()) params.set("query", query.trim());
    router.push(`${path}?${params.toString()}`, { scroll: false });
  }

  async function handleUserChange(nextUser: GoogleUser) {
    setUser(nextUser);
    await persistSession(nextUser);
    setWishlist(await fetchWishlist(nextUser.sub));
    setWishlistAlerts(await fetchWishlistAlerts(nextUser.sub, region));
    const settings = await fetchNotificationSettings(nextUser.sub);
    setEnabledStores(settings.enabledStores?.length ? settings.enabledStores : DEFAULT_NOTIFICATION_SETTINGS.enabledStores);
  }

  function handleSignOut() {
    setUser(null);
    setWishlist([]);
    setWishlistAlerts([]);
    setEnabledStores([...STORES]);
    window.localStorage.removeItem("glitchprice-user");
  }

  async function toggleWishlist(row: PriceRow) {
    if (!user) {
      window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"));
      return;
    }
    const game: WishlistGame = {
      gameId: row.gameId,
      title: row.gameTitle,
      coverUrl: row.coverUrl,
      category: displayGameCategory(row),
      releaseYear: row.releaseYear
    };
    try {
      const nextWishlist = wishlist.some((item) => item.gameId === row.gameId) ? await deleteWishlistItem(user.sub, row.gameId) : await addWishlistItem(user.sub, game);
      setWishlist(nextWishlist);
      setWishlistAlerts(await fetchWishlistAlerts(user.sub, region));
    } catch (error) {
      if ((error as Error)?.message === "session_expired") {
        setUser(null);
        setWishlist([]);
        setWishlistAlerts([]);
        return;
      }
      console.error(error);
    }
  }

  function renderCatalogCard(row: PriceRow, compactComparison = true) {
    return <GameCard key={row.gameId} row={row} analysis={summary.games[row.gameId]}
      historyLows={payload!.history.lowsByGame[row.gameId] ?? {}} enabledStores={enabledStores}
      steamFocus={autumn} wishlisted={wishlist.some(item => item.gameId === row.gameId)}
      compactComparison={compactComparison}
      voteButton={autumn && enabledStores.includes("steam") && (steamOfferDiscount(row) > 0 || communityVotes.votes.includes(row.gameId)) ? <OfferVoteButton voted={communityVotes.votes.includes(row.gameId)} count={communityVotes.data.counts[row.gameId] ?? 0}
        disabled={!!communityVotes.pending || !!user && !communityVotes.ready} pending={communityVotes.pending === row.gameId} onVote={() => communityVotes.toggle(row.gameId)} /> : undefined}
      onToggleWishlist={() => toggleWishlist(row)} usdToArs={payload!.latest.usdToArs || FALLBACK_USD_TO_ARS}
      usdToTarget={payload!.latest.usdToTarget || payload!.latest.usdToArs || FALLBACK_USD_TO_ARS}
      displayCurrency={payload!.latest.currency ?? "ARS"} displayLocale={payload!.latest.locale ?? "es-AR"}
      onOpen={() => setSelectedGameId(row.gameId)} category={category}
      onCategoryClick={value => setCategory(category === value ? "todas" : value)} />;
  }

  return (
    <div className={`appShell catalogCards${autumn ? " autumnOffers" : ""}`}>
      {autumn ? <AutumnLeaves /> : null}
      <nav className="brandBar">
        <div className="brandCluster">
          <Link className="brand" href="/">BARATEAM</Link>
          <ReleaseBadge />
        </div>
        <div className="navTools">
          <ProblemReportButton user={user} />
          <Link className="wishlistNavButton" href="/wishlist">
            <Star size={15} />
            Mi lista
            {wishlistAlerts.length ? <span className="alert">{wishlistAlerts.length}</span> : null}
          </Link>
          <RegionSelector value={region} onChange={setRegion} />
          <UserMenu user={user} onUserChange={handleUserChange} onSignOut={handleSignOut} />
        </div>
      </nav>

      <MobilePrimaryNav current={autumn ? "autumn" : "library"} />

      <aside className="sideNav">
        <div className="sideHeader">
          <h2>Biblioteca</h2>
          <p>Explorar categorías</p>
        </div>
        <div className="sideLinks">
          <Link href="/" className="sideLink">
            <History size={20} />
            Inicio
          </Link>
          <div className={`sideGroup ${libraryMenuOpen ? "open" : ""}`}>
            <button className={`sideLink sideGroupToggle${autumn ? "" : " active"}`} type="button" onClick={() => setLibraryMenuOpen((current) => !current)} aria-expanded={libraryMenuOpen}>
              <span>
                <Library size={20} />
                Biblioteca
              </span>
              <ChevronDown size={17} />
            </button>
            <div className="sideSubLinks">
              <button className={filter === "todos" ? "sideSubLink active" : "sideSubLink"} type="button" onClick={() => activateSidebar({ label: "Biblioteca completa", icon: Library, filter: "todos", sort: "diferencia" })}>
                Todo el catálogo
              </button>
              {SIDEBAR_ITEMS.map((item) => {
                const active = filter === item.filter && sort === item.sort;
                return (
                  <button key={item.label} className={`${active ? "sideSubLink active" : "sideSubLink"} ${item.featured ? "featuredSideLink" : ""}`} type="button" onClick={() => activateSidebar(item)}>
                    {item.label}
                  </button>
                );
              })}
              <Link href="/biblioteca/juego-del-finde" className={filter === WEEKEND_FILTER ? "sideSubLink active" : "sideSubLink"}>Juego del finde</Link>
            </div>
          </div>
          <AutumnNavLink active={autumn} />
          <Link href="/comparativa-general" className="sideLink">
            <BarChart3 size={20} />
            Comparativa general
          </Link>
          {isAdminEmail(user?.email) ? (
            <Link href="/admin/reportes" className="sideLink adminSideLink">
              <ShieldAlert size={20} />
              Reportes
            </Link>
          ) : null}
        </div>
      </aside>

      <main className="page">
        {filter === WEEKEND_FILTER && payload.weekend ? <WeekendShowcase games={payload.weekend.games} offers={payload.weekend.offers} enabledStores={enabledStores} onOpen={openWeekendGame} /> : <header className="heroHeader">
          <div>
            <h1>{autumn ? "Ofertas de otoño" : "¡Compará precios de juegos!"}</h1>
          </div>
        </header>}

        {openingWeekendGame ? <div className="weekendOpeningIndicator" role="status"><span className="mobileSearchSpinner" />Abriendo juego...</div> : null}
        {weekendOpenError ? <p role="alert">No pudimos abrir el juego. Probá de nuevo en unos segundos.</p> : null}
        {filter === WEEKEND_FILTER ? <h2 className="weekendCatalogHeading">Todos nuestros juegos del finde</h2> : null}

        {autumn ? <section className={`autumnSelection${autumnExpanded ? " expanded" : " collapsed"}`} aria-labelledby="autumn-selection-title">
          <div className="autumnSectionHeading"><span className="autumnEyebrow">SHUX × STEAM</span><h2 id="autumn-selection-title">SELECCIÓN DE OFERTAS SHUX</h2><p>¡Los juegos seleccionados de las ofertas de Steam para el video de Shux!</p></div>
          {loading ? <div className="catalogRefreshIndicator" role="status"><span />Actualizando precios...</div> : null}
          {!enabledStores.includes("steam") ? <p role="status">Activá Steam en tus tiendas para ver sus ofertas.</p> : <>
            <div className="gameGrid" id="autumn-selection-games">
              {(payload.autumnSelection ?? []).slice(0, autumnExpanded ? undefined : 4).map(row => renderCatalogCard(row, true))}
            </div>
            {(payload.autumnSelection?.length ?? 0) > 4 ? <div className="autumnExpand"><button type="button" className="button" aria-expanded={autumnExpanded} aria-controls="autumn-selection-games" onClick={() => {
              if (autumnExpanded) document.getElementById("autumn-selection-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
              setAutumnExpanded(current => !current);
            }}><ChevronDown size={18} className={autumnExpanded ? "expanded" : ""} />{autumnExpanded ? "Ver menos" : "Ver todos"}</button></div> : null}
          </>}
        </section> : null}
        {autumn ? <CommunityOffers state={communityVotes} loggedIn={!!user} enabled={enabledStores.includes("steam")} onOpen={gameId => { void openWeekendGame(gameId, "todos"); }} /> : null}
        {autumn ? <h2 className="autumnAllHeading">Todas las ofertas</h2> : null}

        <section className={`toolbar ${queryActive ? "searchActive" : ""}`} aria-label="Controles">
          <label className="search">
            <Search size={20} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar juego..."
              aria-label="Buscar juego"
              enterKeyHint="search"
            />
          </label>
          {queryActive ? (
            <div className="mobileSearchPanel" aria-label="Resultados de búsqueda">
              <div className="mobileSearchStatus" role="status" aria-live="polite">
                {searchPending ? (
                  <>
                    <span className="mobileSearchSpinner" />
                    Buscando juegos...
                  </>
                ) : (
                  `${payload.pagination.total} ${payload.pagination.total === 1 ? "resultado" : "resultados"}`
                )}
              </div>
              {!searchPending && games.length ? (
                <div className="mobileSearchSuggestions">
                  {games.slice(0, 6).map((row) => (
                    <button key={row.gameId} type="button" className="mobileSearchSuggestion" onClick={() => setSelectedGameId(row.gameId)}>
                      {row.coverUrl ? <GameCover src={row.coverUrl} sizes="64px" /> : <span className="mobileSearchCoverFallback" />}
                      <span>
                        <strong>{row.gameTitle}</strong>
                        <small>{[row.releaseYear, formatCategory(displayGameCategory(row))].filter(Boolean).join(" · ")}</small>
                      </span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : null}
              {!searchPending && !games.length ? <p className="mobileSearchEmpty">No encontramos juegos con ese nombre.</p> : null}
            </div>
          ) : null}
          <div className="categoryToggles" aria-label="Filtros de categoría">
            {STEAM_CATEGORY_FILTERS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.value} className={category === item.value ? "active" : ""} onClick={() => setCategory(category === item.value ? "todas" : item.value)}>
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
          <label className="iconSelect">
            <SlidersHorizontal size={20} />
            <select value={filter} onChange={(event) => navigateFilter(event.target.value)} aria-label="Filtro">
              <option value="todos">Todos</option>
              <option value="ofertas">Ofertas 🎁</option>
              <option value={AUTUMN_FILTER}>Ofertas de otoño</option>
              <option value="diferencias">Más baratos que Steam 👀</option>
              <option value="historicos">Mínimos históricos 📉</option>
              <option value={WEEKEND_FILTER}>Juego del finde</option>
              {!mobileFilters ? <option value="completos">Completos</option> : null}
            </select>
          </label>
          <label className="iconSelect">
            <ArrowDownUp size={20} />
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Orden">
              <option value="relevancia">Relevancia</option>
              <option value="descuento">Mayor oferta</option>
              <option value="diferencia">Diferencia</option>
              <option value="precio">Precio</option>
              <option value="cobertura">Cobertura</option>
              <option value="nombre">Nombre</option>
              {filter === WEEKEND_FILTER ? <option value="recientes">Más recientes</option> : null}
            </select>
          </label>
        </section>

        {filter !== WEEKEND_FILTER && !autumn ? <section className={`catalogOverview ${queryActive ? "searchActive" : ""}`} aria-label="Resumen de la biblioteca">
          <div className="catalogOverviewLeft">
          <div className="cards catalogMetrics">
          <Metric title="Tienda más barata promedio" value={summary.cheapestAverageStore ? STORE_LABELS[summary.cheapestAverageStore] : "Sin datos"} />
          <Metric
            title="Más victorias"
            value={summary.mostWinsStore ? STORE_LABELS[summary.mostWinsStore] : "Sin datos"}
            note="Cantidad de juegos que se consiguen más baratos que en el resto de plataformas."
          />
          <Metric title="Juegos cargados" value={String(payload.sampleMeta.broadTotal)} />
          <Metric title="Juegos con precio actual" value={String(summary.gamesAnalyzed)} />
          </div>
          <PopularWishlist onOpen={(gameId) => { void openWeekendGame(gameId, "todos"); }} />
          </div>
          {payload.featuredWeekend ? <div className="weekendFeatured">
            <GameCard intro={<div className="weekendFeaturedHeading">
              <div><h2>Juego del finde</h2><p>La recomendación de la casa para viciar el finde fue <strong>{payload.featuredWeekend.gameTitle}</strong>.</p></div>
              <button type="button" className="weekendFeaturedVideo" onClick={() => { setShowWeekendVideo(true); void openWeekendGame(payload.featuredWeekend!.gameId); }}><Play size={16} />¡Mirá el video acá!</button>
            </div>} row={payload.featuredWeekend}
              analysis={summary.games[payload.featuredWeekend.gameId]}
              historyLows={payload.history.lowsByGame[payload.featuredWeekend.gameId] ?? {}}
              enabledStores={enabledStores} wishlisted={wishlist.some((item) => item.gameId === payload.featuredWeekend!.gameId)}
              onToggleWishlist={() => toggleWishlist(payload.featuredWeekend!)}
              usdToArs={payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
              usdToTarget={payload.latest.usdToTarget || payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
              displayCurrency={payload.latest.currency ?? "ARS"} displayLocale={payload.latest.locale ?? "es-AR"}
              onOpen={() => openWeekendGame(payload.featuredWeekend!.gameId)} category={category}
              onCategoryClick={(value) => setCategory(category === value ? "todas" : value)} />
          </div> : null}
        </section> : null}

        <section className="gameGrid" aria-label="Comparaciones de precios">
          {loading ? (
            <div className="catalogRefreshIndicator" role="status" aria-live="polite">
              <span />
              Actualizando resultados...
            </div>
          ) : null}
          {games.map(row => renderCatalogCard(row))}
        </section>

        <div className="paginationFoot">
          <span>
            Mostrando {games.length} de {payload.pagination.total} juegos filtrados
          </span>
          {payload.pagination.hasMore ? (
            <button className="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Cargando..." : "Cargar más"}
            </button>
          ) : null}
        </div>

        {false ? (
        <details className="chartsPanel">
          <summary>
            <BarChart3 size={18} />
            Gráficos por tienda
          </summary>
          <div className="chartsGrid">
            <BarChart title="Índice de precios" values={storeValues(summary.priceIndexByStore)} suffix="%" signed />
            <BarChart title="Victorias totales" values={storeValues(summary.winsByStore)} />
            <BarChart title="Cantidad de juegos" values={storeValues(summary.coverageByStore)} />
            <BarChart title="Cantidad con descuento" values={storeValues(summary.offersByStore)} />
          </div>
        </details>
        ) : null}

      </main>

      <footer className="footer">
        <Link className="footerCatalogLink" href="/juegos">Catálogo completo de juegos</Link>
        <p>© 2026 BARATEAM. CREADO POR SHUX. PARA CONSULTAS ESCRIBIR A SHUXTEAM@GMAIL.COM O @SHUXTEAM EN INSTAGRAM</p>
        <LegalLinks />
      </footer>

      {selectedRow ? (
        <GameDetailModal
          row={selectedRow}
          voteButton={autumn && enabledStores.includes("steam") && (steamOfferDiscount(selectedRow) > 0 || communityVotes.votes.includes(selectedRow.gameId)) ? <OfferVoteButton voted={communityVotes.votes.includes(selectedRow.gameId)} count={communityVotes.data.counts[selectedRow.gameId] ?? 0}
            disabled={!!communityVotes.pending || !!user && !communityVotes.ready} pending={communityVotes.pending === selectedRow.gameId} onVote={() => communityVotes.toggle(selectedRow.gameId)} /> : undefined}
          analysis={summary.games[selectedRow.gameId]}
          lows={payload.history.lowsByGame[selectedRow.gameId] ?? {}}
          enabledStores={enabledStores}
          historyEntries={payload.history.entriesByGame[selectedRow.gameId] ?? []}
          historyLoading={loadingGameHistoryId === selectedRow.gameId}
          usdToArs={payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
          usdToTarget={payload.latest.usdToTarget || payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
          displayCurrency={payload.latest.currency ?? "ARS"}
          displayLocale={payload.latest.locale ?? "es-AR"}
          user={user}
          wishlisted={wishlist.some((item) => item.gameId === selectedRow.gameId)}
          onToggleWishlist={() => toggleWishlist(selectedRow)}
          onClose={() => {
            setSelectedGameId(null);
            const url = new URL(window.location.href);
            if (url.searchParams.has("game")) {
              url.searchParams.delete("game");
              window.history.replaceState(null, "", url.pathname + url.search);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function BibliotecaLoading() {
  return (
    <main className="loadingPage">
      <div className="catalogSkeleton" aria-label="Cargando catálogo">
        <div className="skeletonTop">
          <span />
          <span />
        </div>
        <div className="skeletonMetrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="skeletonGrid">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index}>
              <span />
              <div>
                <i />
                <i />
                <i />
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function GameCard({
  intro,
  voteButton,
  compactComparison = false,
  steamFocus = false,
  row,
  analysis,
  historyLows,
  enabledStores,
  wishlisted,
  onToggleWishlist,
  usdToArs,
  usdToTarget,
  displayCurrency,
  displayLocale,
  onOpen,
  category,
  onCategoryClick
}: {
  intro?: ReactNode;
  voteButton?: ReactNode;
  compactComparison?: boolean;
  steamFocus?: boolean;
  row: PriceRow;
  analysis: GameAnalysis | undefined;
  historyLows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  wishlisted: boolean;
  onToggleWishlist: () => void;
  usdToArs: number;
  usdToTarget: number;
  displayCurrency: string;
  displayLocale: string;
  onOpen: () => void;
  category: string;
  onCategoryClick: (category: string) => void;
}) {
  const winner = analysis?.winner ?? null;
  const activeStores = enabledStores.length ? enabledStores : STORES;
  const pricedStores = activeStores.filter((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null);
  const activeWinner = winner && activeStores.includes(winner) ? winner : null;
  const alternatives = pricedStores.filter(store => store !== "steam")
    .sort((a, b) => (row.prices[a]?.arsFinalPrice ?? Infinity) - (row.prices[b]?.arsFinalPrice ?? Infinity));
  const visibleStores: StoreId[] = compactComparison ? [...(activeStores.includes("steam") ? ["steam" as StoreId] : []), ...alternatives.slice(0, 1)] : activeWinner
    ? Array.from(new Set(["steam" as StoreId, activeWinner, ...pricedStores.filter((store) => store !== "steam" && store !== activeWinner)])).filter((store) => activeStores.includes(store)).slice(0, 5)
    : pricedStores.slice(0, 5);
  const bestDiscount = bestDiscountOffer(row, steamFocus ? activeStores.filter(store => store === "steam") : activeStores);

  return (
    <article className={`gameCard${steamFocus ? " autumnGameCard" : ""}${compactComparison ? " compactComparison" : ""}`}>
      {intro}
      <div
        className="gameHero clickableHero"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
      >
        {row.coverUrl ? <GameCover src={row.coverUrl} sizes="(max-width: 700px) calc(100vw - 32px), (max-width: 1100px) 45vw, 380px" /> : <div className="coverFallback" />}
        {bestDiscount ? (
          <span className={`discountRibbon discountRibbon-${bestDiscount.store}`} aria-label={`Descuento ${bestDiscount.discountPct}%`}>
            -{bestDiscount.discountPct}%
          </span>
        ) : null}
        {row.weekendGame ? <div className="weekendCardTag"><WeekendTag /></div> : null}
        {voteButton}
        <button
          className={wishlisted ? "wishlistStar active" : "wishlistStar"}
          type="button"
          aria-label={wishlisted ? "Quitar de deseados" : "Guardar en deseados"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWishlist();
          }}
        >
          <Star size={18} />
        </button>
        <div className="gameHeroOverlay" />
        <div className="gameHeroText">
          {row.productKind === "pack" ? <span className="packTag">PACK / COLECCIÓN</span> : null}
          <h3><a className="gameTitleLink" href={`/juegos/${row.gameId}`} onClick={(event) => { event.stopPropagation(); if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onOpen(); } }} onKeyDown={(event) => event.stopPropagation()}>{row.gameTitle}</a></h3>
          <button
            className={category === displayGameCategory(row) ? "categoryFilter active" : "categoryFilter"}
            onClick={(event) => {
              event.stopPropagation();
              onCategoryClick(displayGameCategory(row));
            }}
            title="Filtrar por categoría"
          >
            {row.gameId.startsWith("shux-steam-") ? "Selección de Shux" : `${formatReleaseYear(row.releaseYear)} · ${formatCategory(displayGameCategory(row))}`}
          </button>
        </div>
      </div>

      <div className="gameCardBody">
        {steamFocus && steamAtHistoricalLow(row, historyLows.steam) ? <span className="autumnLowTag"><History size={13} />Mínimo histórico en Steam</span> : null}
        <div className="priceTiles">
          {visibleStores.length ? (
            visibleStores.map((store) => (
              <StorePriceTile
                key={store}
                store={store}
                price={row.prices[store]}
                winner={winner === store}
                index={analysis?.priceIndex[store]}
                differenceVsSteam={winner === store ? analysis?.differenceVsSteam : null}
                displayCurrency={displayCurrency}
                displayLocale={displayLocale}
                logos={compactComparison && store !== "steam" ? alternatives.slice(0, 3) : undefined}
              />
            ))
          ) : (
            <div className="emptyPrices">{row.isFree ? <a href={row.prices.steam?.url ?? (row.weekendGame ? `https://store.steampowered.com/app/${row.weekendGame.steamAppId}/` : "https://store.steampowered.com/")} target="_blank" rel="noopener noreferrer">Gratuito en Steam</a> : row.weekendGame ? "Precios pendientes de incorporación" : "Sin precios disponibles"}</div>
          )}
          {compactComparison && !alternatives.length && activeStores.includes("steam") ? <div className="compactNoAlternative">Sin precio en otras tiendas</div> : null}
        </div>

        <HistoricalLowStrip lows={historyLows} enabledStores={activeStores} usdToArs={usdToArs} usdToTarget={usdToTarget} displayCurrency={displayCurrency} displayLocale={displayLocale} onOpen={onOpen} />
        {row.productKind === "pack" && row.prices.steam?.url?.includes("/bundle/") ? <p className="bundlePriceNote">Precio del bundle completo. Steam puede descontar los juegos que ya tenés.</p> : null}
      </div>
    </article>
  );
}

function bestDiscountOffer(row: PriceRow, stores: StoreId[]): { store: StoreId; discountPct: number } | null {
  return stores
    .map((store) => ({ store, discountPct: discountPct(row.prices[store]) }))
    .filter((offer): offer is { store: StoreId; discountPct: number } => offer.discountPct != null && offer.discountPct > 0)
    .sort((a, b) => b.discountPct - a.discountPct)[0] ?? null;
}

function discountPct(price: NormalizedPrice | undefined): number | null {
  if (!price?.available) return null;
  if (typeof price.discountPct === "number" && Number.isFinite(price.discountPct) && price.discountPct > 0) {
    return Math.round(price.discountPct);
  }
  if (price.arsBasePrice != null && price.arsFinalPrice != null && price.arsBasePrice > price.arsFinalPrice) {
    return Math.round((1 - price.arsFinalPrice / price.arsBasePrice) * 100);
  }
  return null;
}

function StorePriceTile({
  store,
  logos,
  price,
  winner,
  index,
  differenceVsSteam,
  displayCurrency,
  displayLocale
}: {
  store: StoreId;
  logos?: StoreId[];
  price: NormalizedPrice | undefined;
  winner: boolean;
  index: number | null | undefined;
  differenceVsSteam: number | null | undefined;
  displayCurrency: string;
  displayLocale: string;
}) {
  if (!price || !price.available || price.arsFinalPrice == null) {
    return (
      <div className="priceTile unavailable">
        <div className="storeName">
          <StoreLogo store={store} />
          {STORE_LABELS[store]}
        </div>
        <strong>Sin dato</strong>
      </div>
    );
  }

  const content = (
    <>
      {winner ? <span className="winnerTag">WINNER</span> : null}
      {logos ? <span className="compactOtherLogos" aria-label={`Otras tiendas con precio: ${logos.map(item => STORE_LABELS[item]).join(", ")}`}>{logos.map(item => <span key={item} title={STORE_LABELS[item]} className={item === store ? "selected" : ""}><StoreLogo store={item} /></span>)}</span> : null}
      <div className="storeName">
        {logos ? null : <StoreLogo store={store} />}
        {STORE_LABELS[store]}
      </div>
      <strong>{formatOfficialPrice(price)}</strong>
      <small>
        {formatConvertedPriceLabel(price, displayCurrency)} {formatArs(price.arsFinalPrice, displayCurrency, displayLocale)}
        <br />
        {price.discountPct ? `Desc: -${price.discountPct}%` : `Dif: ${formatIndex(index)}`}
        {price.isStale ? (
          <>
            <br />
            <em className="stalePriceLabel">{price.staleReason ?? "Dato pendiente de actualizacion"}</em>
          </>
        ) : null}
        {price.source === "manual" ? (
          <>
            <br />
            <em className="manualPriceLabel">Dato manual auditado</em>
          </>
        ) : null}
      </small>
      {winner && differenceVsSteam != null ? (
        <span className={differenceVsSteam < 0 ? "winnerDiff good" : "winnerDiff"}>
          vs Steam {formatArs(differenceVsSteam, displayCurrency, displayLocale)}
        </span>
      ) : null}
    </>
  );

  if (!price.url) {
    return <div className={priceTileClass(winner, price)}>{content}</div>;
  }

  return (
    <a className={priceTileClass(winner, price)} href={price.url} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

function priceTileClass(winner: boolean, price: NormalizedPrice): string {
  return ["priceTile", winner ? "winnerTile" : "", price.isStale ? "staleTile" : ""].filter(Boolean).join(" ");
}

function HistoricalLowStrip({
  lows,
  enabledStores,
  usdToArs,
  usdToTarget,
  displayCurrency,
  displayLocale,
  onOpen
}: {
  lows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  usdToArs: number;
  usdToTarget: number;
  displayCurrency: string;
  displayLocale: string;
  onOpen?: () => void;
}) {
  const activeStores = enabledStores.length ? enabledStores : STORES;

  return (
    <button className="historyStrip" aria-label="Ver mínimo histórico y evolución completa" onClick={onOpen}>
      <LowestHistoricalLow
        lows={lows}
        stores={activeStores}
        usdToArs={usdToArs}
        usdToTarget={usdToTarget}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
      />
    </button>
  );
}

function LowestHistoricalLow({
  lows,
  stores,
  usdToArs,
  usdToTarget,
  displayCurrency,
  displayLocale,
  expanded = false
}: {
  lows: PriceHistoryReport["lowsByGame"][string];
  stores: StoreId[];
  usdToArs: number;
  usdToTarget: number;
  displayCurrency: string;
  displayLocale: string;
  expanded?: boolean;
}) {
  const lowest = stores
    .map((store) => ({
      store,
      low: lows[store],
      comparablePrice: comparableHistoricalPrice(lows[store], displayCurrency, usdToTarget)
    }))
    .filter((entry) => entry.comparablePrice != null)
    .sort((a, b) => (a.comparablePrice ?? Number.MAX_SAFE_INTEGER) - (b.comparablePrice ?? Number.MAX_SAFE_INTEGER))[0];

  return (
    <div className={expanded ? "historyMinimum expanded" : "historyMinimum"}>
      <div>
        <span className="historyTitle">El mínimo histórico 📉</span>
        <small>
          {lowest ? (
            <>
              <StoreLogo store={lowest.store} />
              {STORE_LABELS[lowest.store]}
            </>
          ) : "Se completa al actualizar precios."}
        </small>
      </div>
      <strong>
        {lowest?.low ? formatHistoricalOfficialPrice(lowest.low, lowest.store, usdToArs, displayCurrency, displayLocale) : "Sin dato"}
      </strong>
    </div>
  );
}

function GameDetailModal({
  row,
  voteButton,
  analysis,
  lows,
  enabledStores,
  historyEntries,
  historyLoading,
  usdToArs,
  usdToTarget,
  displayCurrency,
  displayLocale,
  user,
  wishlisted,
  onToggleWishlist,
  onClose
}: {
  row: PriceRow;
  voteButton?: ReactNode;
  analysis: GameAnalysis | undefined;
  lows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  historyEntries: PriceHistoryReport["entriesByGame"][string];
  historyLoading: boolean;
  usdToArs: number;
  usdToTarget: number;
  displayCurrency: string;
  displayLocale: string;
  user: GoogleUser | null;
  wishlisted: boolean;
  onToggleWishlist: () => void;
  onClose: () => void;
}) {
  const activeStores = enabledStores.length ? enabledStores : STORES;
  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section className="gameModal" role="dialog" aria-modal="true" aria-label={row.gameTitle} onClick={(event) => event.stopPropagation()}>
        <div className="modalActions">
          {row.weekendGame ? <WeekendTag /> : null}
          {voteButton}
          <button
            className={wishlisted ? "wishlistStar modalWishlistStar active" : "wishlistStar modalWishlistStar"}
            type="button"
            aria-label={wishlisted ? "Quitar de deseados" : "Guardar en deseados"}
            onClick={onToggleWishlist}
          >
            <Star size={18} />
          </button>
          <ProblemReportButton user={user} />
          <button className="modalClose" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <header className="modalHero">
          {row.coverUrl ? <img src={row.coverUrl} alt="" /> : <div className="coverFallback" />}
          <div className="gameHeroOverlay" />
          <div>
            <h2>{row.gameTitle}</h2>
            <span>
              {row.gameId.startsWith("shux-steam-") ? "Selección de Shux" : `${formatReleaseYear(row.releaseYear)} · ${formatCategory(displayGameCategory(row))}`}
            </span>
          </div>
        </header>

        <div className="modalContent">
          <section>
            <h3>Precios actuales</h3>
            <div className="modalPriceGrid">
              {activeStores.map((store) => (
                <ModalStorePrice
                  key={store}
                  store={store}
                  price={row.prices[store]}
                  winner={analysis?.winner === store}
                  low={lows[store]}
                  usdToArs={usdToArs}
                  displayCurrency={displayCurrency}
                  displayLocale={displayLocale}
                />
              ))}
            </div>
          </section>

          <section>
            <h3>Evolución histórica</h3>
          <PriceHistoryChart
            entries={historyEntries}
            lows={lows}
            currentPrices={row.prices}
            enabledStores={activeStores}
            currentWinner={analysis?.winner ?? null}
            loading={historyLoading}
            usdToArs={usdToArs}
            usdToTarget={usdToTarget}
            displayCurrency={displayCurrency}
            displayLocale={displayLocale}
          />
          </section>
          {row.weekendGame ? <WeekendRecommendation key={row.gameId} game={row.weekendGame} gameId={row.gameId} /> : null}
        </div>
      </section>
    </div>
  );
}

function ModalStorePrice({
  store,
  price,
  winner,
  low,
  usdToArs,
  displayCurrency,
  displayLocale
}: {
  store: StoreId;
  price: NormalizedPrice | undefined;
  winner: boolean;
  low: PriceHistoryReport["lowsByGame"][string][StoreId];
  usdToArs: number;
  displayCurrency: string;
  displayLocale: string;
}) {
  const content = (
    <>
      <span>{STORE_LABELS[store]}</span>
      <strong>{price?.available ? formatOfficialPrice(price) : "Sin dato"}</strong>
      <small>{price?.available ? `${formatConvertedPriceLabel(price, displayCurrency)} ${formatArs(price.arsFinalPrice, displayCurrency, displayLocale)}` : "No disponible"}</small>
      <em>Mínimo: {low ? formatHistoricalOfficialPrice(low, store, usdToArs, displayCurrency, displayLocale) : "Sin dato"}</em>
      {winner ? <b>Ganador actual</b> : null}
    </>
  );

  if (!price?.url) return <div className="modalStorePrice">{content}</div>;
  return (
    <a className="modalStorePrice" href={price.url} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

function PriceHistoryChart({
  entries,
  lows,
  currentPrices,
  enabledStores,
  currentWinner,
  loading,
  usdToArs,
  usdToTarget,
  displayCurrency,
  displayLocale
}: {
  entries: PriceHistoryReport["entriesByGame"][string];
  lows: PriceHistoryReport["lowsByGame"][string];
  currentPrices: PriceRow["prices"];
  enabledStores: StoreId[];
  currentWinner: StoreId | null;
  loading: boolean;
  usdToArs: number;
  usdToTarget: number;
  displayCurrency: string;
  displayLocale: string;
}) {
  const chartStores = enabledStores.length ? enabledStores : STORES;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; store: StoreId; date: string; price: string } | null>(null);
  const [focusedStore, setFocusedStore] = useState<StoreId | null>(currentWinner && chartStores.includes(currentWinner) ? currentWinner : chartStores[0] ?? null);
  useEffect(() => {
    setFocusedStore(currentWinner && chartStores.includes(currentWinner) ? currentWinner : chartStores[0] ?? null);
  }, [currentWinner, enabledStores, entries]);
  const realChartEntries = entries.filter((entry) => entry.kind !== "historical_low" && chartStores.includes(entry.store) && entry.arsFinalPrice != null && entry.arsFinalPrice > 0);
  const firstEntryDate = realChartEntries.length ? new Date(Math.min(...realChartEntries.map((entry) => Date.parse(entry.timestamp)))) : new Date();
  const endDate = new Date();
  const sixMonthsAgo = new Date(endDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const rangeStart = firstEntryDate.getTime() <= sixMonthsAgo.getTime() ? sixMonthsAgo : firstEntryDate;
  const startDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const chartEntries = historyChartObservations(realChartEntries, startDate, endDate);
  const values = chartEntries.map((entry) => entry.arsFinalPrice ?? 0);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const hasSeries = chartEntries.length > 0;
  const width = 720;
  const height = 250;
  const padX = 42;
  const padTop = 24;
  const padBottom = 42;
  const span = Math.max(1, maxValue - minValue);
  const minDate = startDate.getTime();
  const maxDate = endDate.getTime();
  const dateSpan = Math.max(1, maxDate - minDate);
  const visibleTicks = monthTicks(startDate, endDate);
  const yTicks = [0, 1, 2, 3].map((index) => minValue + (span / 3) * index);
  const opacityForStore = (store: StoreId) => (!focusedStore || focusedStore === store ? 1 : 0.4);

  function x(timestamp: string): number {
    return padX + ((Date.parse(timestamp) - minDate) / dateSpan) * (width - padX * 2);
  }

  function y(value: number): number {
    return height - padBottom - ((value - minValue) / span) * (height - padTop - padBottom);
  }

  return (
    <div className="historyChart">
      {hasSeries ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de precios normalizados">
          <line className="axisLine" x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} />
          <line className="axisLine" x1={padX} y1={padTop} x2={padX} y2={height - padBottom} />
          {yTicks.map((value) => (
            <g className="valueTick" key={value}>
              <text x={padX - 8} y={y(value) + 4}>
                {formatCompactCurrency(value, displayCurrency, displayLocale)}
              </text>
            </g>
          ))}
          {visibleTicks.map((date) => {
            const timestamp = date.toISOString();
            const tickX = x(timestamp);
            return (
              <g className="dateTick" key={timestamp}>
                <line x1={tickX} y1={padTop} x2={tickX} y2={height - padBottom} />
                <text x={tickX} y={height - 17}>
                  {formatMonthLabel(date)}
                </text>
              </g>
            );
          })}
          {chartStores.map((store) => {
            const points = chartEntries
              .filter((entry) => entry.store === store)
              .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
              .flatMap((entry, index, series) => index ? [`${x(entry.timestamp)},${y(series[index - 1].arsFinalPrice ?? 0)}`, `${x(entry.timestamp)},${y(entry.arsFinalPrice ?? 0)}`] : [`${x(entry.timestamp)},${y(entry.arsFinalPrice ?? 0)}`])
              .join(" ");
            return points ? (
              <polyline
                key={store}
                points={points}
                style={{ stroke: storeColor(store), opacity: opacityForStore(store) }}
                onClick={() => setFocusedStore(store)}
              />
            ) : null;
          })}
          {chartEntries.map((entry) => {
            const pointX = x(entry.timestamp);
            const pointY = y(entry.arsFinalPrice ?? 0);
            return (
              <circle
                key={`${entry.store}-${entry.timestamp}-${entry.arsFinalPrice}-${entry.source}`}
                cx={pointX}
                cy={pointY}
                r="5"
                style={{ fill: storeColor(entry.store), opacity: opacityForStore(entry.store) }}
                onClick={() => setFocusedStore(entry.store)}
                onMouseEnter={() =>
                  setTooltip({
                    x: pointX,
                    y: pointY,
                    store: entry.store,
                    date: formatFullDate(entry.timestamp),
                    price: formatArs(entry.arsFinalPrice, displayCurrency, displayLocale)
                  })
                }
                onMouseMove={() =>
                  setTooltip({
                    x: pointX,
                    y: pointY,
                    store: entry.store,
                    date: formatFullDate(entry.timestamp),
                    price: formatArs(entry.arsFinalPrice, displayCurrency, displayLocale)
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
      ) : (
        <div className="emptyChart">{loading ? "Cargando historial..." : "Sin historial suficiente todavía."}</div>
      )}
      {tooltip ? (
        <div className="chartTooltip" style={{ left: `${(tooltip.x / width) * 100}%`, top: `${(tooltip.y / height) * 100}%` }}>
          <span>{STORE_LABELS[tooltip.store]}</span>
          <strong>{tooltip.price}</strong>
          <em>{tooltip.date}</em>
        </div>
      ) : null}
      <div className="chartLegend">
        {chartStores.map((store) => (
          <button
            key={store}
            className={focusedStore === store ? "active" : ""}
            type="button"
            onClick={() => setFocusedStore(store)}
          >
            <StoreLogo store={store} />
            {STORE_LABELS[store]}
          </button>
        ))}
      </div>
      <small>
        Registros observados de los últimos 6 meses. Los mínimos históricos se muestran por separado; no representan una evolución continua.
      </small>
      <LowestHistoricalLow
        lows={lows}
        stores={chartStores}
        usdToArs={usdToArs}
        usdToTarget={usdToTarget}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
        expanded
      />
      <h4 className="historyLowTitle">MÍNIMOS HISTÓRICOS POR TIENDA</h4>
      <div className="historyLowCapsules">
        {chartStores.map((store) => {
          const low = lows[store];
          const current = currentPrices[store]?.arsFinalPrice ?? null;
          return (
            <div className="historyLowCapsule" key={store}>
              <span>{STORE_LABELS[store]}</span>
              <strong>{low ? formatHistoricalOfficialPrice(low, store, usdToArs, displayCurrency, displayLocale) : "Sin dato"}</strong>
              <em>{formatLowDifference(low?.arsFinalPrice ?? null, current)}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bestIndexLabel(summary: AnalysisSummary): string {
  const best = STORES.filter((store) => summary.priceIndexByStore[store] != null).sort(
    (a, b) => (summary.priceIndexByStore[a] ?? 9999) - (summary.priceIndexByStore[b] ?? 9999)
  )[0];
  if (!best) return "Sin datos";
  const value = summary.priceIndexByStore[best] ?? 0;
  return `${STORE_LABELS[best]} ${value}%`;
}

function Metric({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <article className="metric">
      <span>{title}</span>
      {note ? <small>{note}</small> : null}
      <strong>{value}</strong>
    </article>
  );
}

function StoreLogo({ store }: { store: StoreId }) {
  return <img className="storeLogo" src={STORE_LOGOS[store]} alt="" aria-hidden="true" />;
}

function formatOfficialPrice(price: NormalizedPrice): string {
  if (price.originalFinalPrice == null || !price.originalCurrency) return "Sin precio";
  if (price.originalCurrency.toUpperCase() === "ARS") return `ARS ${price.originalFinalPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  return `${price.originalCurrency} ${price.originalFinalPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function formatConvertedPriceLabel(price: NormalizedPrice, displayCurrency: string): string {
  const original = price.originalCurrency?.toUpperCase();
  const display = displayCurrency.toUpperCase();
  if (!original || original === display) return display === "ARS" ? "ARS + IVA:" : `${display}:`;
  return display === "ARS" ? "ARS + IVA:" : `${display} conv.:`;
}

function formatReleaseYear(year: number): string {
  return year > 0 ? String(year) : "s/d";
}

function formatCategory(category: string): string {
  return formatGameCategory(category);
}

function displayGameCategory(row: Pick<PriceRow, "primaryTag" | "category">): string {
  return row.primaryTag?.trim() || row.category;
}

function comparableHistoricalPrice(
  price: PriceHistoryReport["lowsByGame"][string][StoreId],
  displayCurrency: string,
  usdToTarget: number
): number | null {
  if (!price || price.originalFinalPrice == null || price.originalFinalPrice <= 0) return null;

  const currency = (price.originalCurrency ?? "USD").toUpperCase();
  const normalized = price.arsFinalPrice != null && price.arsFinalPrice > 0 ? price.arsFinalPrice : null;
  if (currency === displayCurrency.toUpperCase()) return normalized ?? price.originalFinalPrice;

  if (currency === "USD" && usdToTarget > 0) {
    const converted = price.originalFinalPrice * usdToTarget;
    // Some legacy USD lows stored their dollar amount in the normalized field.
    // Keep valid tax-adjusted values, but reject values far below the conversion.
    if (normalized != null && (usdToTarget <= 2 || normalized >= converted * 0.5)) return normalized;
    return converted;
  }

  return normalized ?? price.originalFinalPrice;
}

function formatHistoricalOfficialPrice(
  price: PriceHistoryReport["lowsByGame"][string][StoreId],
  store: StoreId,
  usdToArs: number,
  displayCurrency = "ARS",
  displayLocale = "es-AR"
): string {
  if (!price || price.originalFinalPrice == null) return "Sin dato";
  const currency = (price.originalCurrency ?? "USD").toUpperCase();
  if (currency === displayCurrency) {
    return formatArs(price.originalFinalPrice, displayCurrency, displayLocale);
  }
  if (currency === "USD") {
    return `USD ${price.originalFinalPrice.toLocaleString(displayLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === "EUR") {
    return `EUR ${price.originalFinalPrice.toLocaleString(displayLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${price.originalFinalPrice.toLocaleString(displayLocale, { maximumFractionDigits: 2 })}`;
}

function formatIndex(value: number | null | undefined): string {
  if (value == null) return "Sin dato";
  return value === 0 ? "0%" : `+${value}%`;
}

function storeColor(store: StoreId): string {
  return {
    steam: "#2a8cff",
    epic: "#f7f1e6",
    gog: "#a970ff",
    humble: "#df2f32",
    microsoft: "#37c86a"
  }[store];
}

function monthTicks(startDate: Date, endDate: Date): Date[] {
  const ticks: Date[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  if (cursor.getTime() < startDate.getTime()) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() <= endDate.getTime()) {
    ticks.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", { month: "short" }).format(date).replace(".", "");
}

function formatFullDate(timestamp: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(timestamp));
}

function formatCompactCurrency(value: number, currency: string, locale: string): string {
  if (value >= 1000000) return `$${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return formatArs(value, currency, locale);
}

function formatLowDifference(low: number | null, current: number | null): string {
  if (low == null || current == null || low <= 0 || current <= 0) return "Sin comparación";
  const pct = low < current
    ? Math.round(((current - low) / current) * 100)
    : Math.round(((low - current) / current) * 100);
  if (pct === 0) return "Igual que ahora";
  return low < current ? `${pct}% menos que ahora` : `${pct}% más que ahora`;
}

function storeValues(values: Partial<Record<StoreId, number | null | undefined>>): Array<{ store: StoreId; value: number | null }> {
  return STORES.map((store) => ({ store, value: values[store] ?? null }));
}

function BarChart({
  title,
  values,
  suffix = "",
  signed = false
}: {
  title: string;
  values: Array<{ store: StoreId; value: number | null }>;
  suffix?: string;
  signed?: boolean;
}) {
  const max = Math.max(1, ...values.map((item) => item.value ?? 0));
  const victoryNote = title.toLowerCase().includes("victorias")
    ? "Cantidad de juegos que se consiguen más baratos que en el resto de plataformas."
    : null;
  return (
    <article className="chartCard">
      <h3>{title}</h3>
      {victoryNote ? <p className="chartNote">{victoryNote}</p> : null}
      <div className="bars">
        {values.map(({ store, value }) => {
          const width = value == null ? 0 : Math.max(2, Math.round((value / max) * 100));
          return (
            <div className="barRow" key={store}>
              <span>{STORE_LABELS[store]}</span>
              <div className="barTrack" aria-hidden="true">
                <div className="barFill" style={{ width: `${width}%` }} />
              </div>
              <strong>{value == null ? "Sin datos" : `${signed ? "+" : ""}${value}${suffix}`}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}
