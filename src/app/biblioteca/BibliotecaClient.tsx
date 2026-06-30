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
  ShieldAlert,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import type { LatestPrices, NormalizedPrice, PriceHistoryReport, StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";

type ApiPayload = {
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
  { label: "Ofertas de Steam 🔥", icon: Flame, filter: "steam-ofertas", sort: "relevancia", featured: true },
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

export function BibliotecaClient({ initialPayload }: { initialPayload: ApiPayload | null }) {
  return (
    <Suspense fallback={<BibliotecaLoading />}>
      <BibliotecaContent initialPayload={initialPayload} />
    </Suspense>
  );
}

function BibliotecaContent({ initialPayload }: { initialPayload: ApiPayload | null }) {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ApiPayload | null>(initialPayload);
  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("query") ?? "");
  const [category, setCategory] = useState("todas");
  const [filter, setFilter] = useState(searchParams.get("filter") ?? "todos");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "diferencia");
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(true);
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [loading, setLoading] = useState(!initialPayload);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [loadingGameHistoryId, setLoadingGameHistoryId] = useState<string | null>(null);
  const historyAttemptsRef = useRef(new Set<string>());
  const initialPayloadRef = useRef(Boolean(initialPayload));
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [wishlistAlerts, setWishlistAlerts] = useState<WishlistAlert[]>([]);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>([...STORES]);

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
      setEnabledStores([...STORES]);
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
    fetchCatalog({ offset: 0 })
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [debouncedQuery, category, filter, sort, region, enabledStores]);

  useEffect(() => {
    const selectedFromUrl = searchParams.get("game");
    if (!payload || !selectedFromUrl) return;
    const row = payload.latest.prices.find((game) => game.gameId === selectedFromUrl);
    if (row) setSelectedGameId(row.gameId);
  }, [payload, searchParams]);

  const games = payload?.latest.prices ?? [];

  useEffect(() => {
    if (!selectedGameId || !payload) return;
    const loadedEntries = payload.history.entriesByGame[selectedGameId]?.filter((entry) => entry.arsFinalPrice != null && entry.arsFinalPrice > 0) ?? [];
    if (loadedEntries.length >= 2) return;
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
        if (!controller.signal.aborted) setLoadingGameHistoryId(null);
      });
    return () => controller.abort();
  }, [selectedGameId, payload, region]);

  if (!payload) {
    return <BibliotecaLoading />;
  }

  const summary = payload.analysis.broad;
  const selectedRow = selectedGameId ? payload.latest.prices.find((row) => row.gameId === selectedGameId) ?? null : null;
  const queryActive = query.trim().length > 0;
  const searchPending = query.trim() !== debouncedQuery.trim() || loading;

  async function fetchCatalog(options: { offset: number; refresh?: boolean }): Promise<ApiPayload> {
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
    return fetch(`/api/catalog?${params.toString()}`).then((res) => res.json());
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
    setFilter(filter === item.filter && sort === item.sort ? "todos" : item.filter);
    setSort(item.sort);
    setCategory("todas");
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

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <div className="brand">BARATEAM</div>
          <span className="betaBadge">BETA</span>
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
            <button className="sideLink sideGroupToggle active" type="button" onClick={() => setLibraryMenuOpen((current) => !current)} aria-expanded={libraryMenuOpen}>
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
            </div>
          </div>
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
        <header className="heroHeader">
          <div>
            <h1>¡Compará precios de juegos!</h1>
          </div>
        </header>

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
                      {row.coverUrl ? <img src={row.coverUrl} alt="" loading="lazy" /> : <span className="mobileSearchCoverFallback" />}
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
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtro">
              <option value="todos">Todos</option>
              <option value="steam-ofertas">Ofertas de Steam 🔥</option>
              <option value="ofertas">Ofertas 🎁</option>
              <option value="diferencias">Más baratos que Steam 👀</option>
              <option value="historicos">Mínimos históricos 📉</option>
              <option value="completos">Completos</option>
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
            </select>
          </label>
        </section>

        <section className={`cards catalogMetrics ${queryActive ? "searchActive" : ""}`}>
          <Metric title="Tienda más barata promedio" value={summary.cheapestAverageStore ? STORE_LABELS[summary.cheapestAverageStore] : "Sin datos"} />
          <Metric
            title="Más victorias"
            value={summary.mostWinsStore ? STORE_LABELS[summary.mostWinsStore] : "Sin datos"}
            note="Cantidad de juegos que se consiguen más baratos que en el resto de plataformas."
          />
          <Metric title="Juegos cargados" value={String(payload.sampleMeta.broadTotal)} />
          <Metric title="Juegos con precio actual" value={String(summary.gamesAnalyzed)} />
        </section>

        <section className="gameGrid" aria-label="Comparaciones de precios">
          {loading ? (
            <div className="catalogRefreshIndicator" role="status" aria-live="polite">
              <span />
              Actualizando resultados...
            </div>
          ) : null}
          {games.map((row) => (
            <GameCard
              key={row.gameId}
              row={row}
              analysis={summary.games[row.gameId]}
              historyLows={payload.history.lowsByGame[row.gameId] ?? {}}
              enabledStores={enabledStores}
              wishlisted={wishlist.some((item) => item.gameId === row.gameId)}
              onToggleWishlist={() => toggleWishlist(row)}
              usdToArs={payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
              displayCurrency={payload.latest.currency ?? "ARS"}
              displayLocale={payload.latest.locale ?? "es-AR"}
              onOpen={() => setSelectedGameId(row.gameId)}
              category={category}
              onCategoryClick={(value) => setCategory(category === value ? "todas" : value)}
            />
          ))}
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
        <p>© 2026 BARATEAM. CREADO POR SHUX. PARA CONSULTAS ESCRIBIR A SHUXTEAM@GMAIL.COM O @SHUXTEAM EN INSTAGRAM</p>
      </footer>

      {selectedRow ? (
        <GameDetailModal
          row={selectedRow}
          analysis={summary.games[selectedRow.gameId]}
          lows={payload.history.lowsByGame[selectedRow.gameId] ?? {}}
          enabledStores={enabledStores}
          historyEntries={payload.history.entriesByGame[selectedRow.gameId] ?? []}
          historyLoading={loadingGameHistoryId === selectedRow.gameId}
          usdToArs={payload.latest.usdToArs || FALLBACK_USD_TO_ARS}
          displayCurrency={payload.latest.currency ?? "ARS"}
          displayLocale={payload.latest.locale ?? "es-AR"}
          user={user}
          wishlisted={wishlist.some((item) => item.gameId === selectedRow.gameId)}
          onToggleWishlist={() => toggleWishlist(selectedRow)}
          onClose={() => setSelectedGameId(null)}
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
  row,
  analysis,
  historyLows,
  enabledStores,
  wishlisted,
  onToggleWishlist,
  usdToArs,
  displayCurrency,
  displayLocale,
  onOpen,
  category,
  onCategoryClick
}: {
  row: PriceRow;
  analysis: GameAnalysis | undefined;
  historyLows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  wishlisted: boolean;
  onToggleWishlist: () => void;
  usdToArs: number;
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
  const visibleStores = activeWinner
    ? Array.from(new Set(["steam" as StoreId, activeWinner, ...pricedStores.filter((store) => store !== "steam" && store !== activeWinner)])).filter((store) => activeStores.includes(store)).slice(0, 5)
    : pricedStores.slice(0, 5);
  const bestDiscount = bestDiscountOffer(row, activeStores);

  return (
    <article className="gameCard">
      <div
        className="gameHero clickableHero"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
      >
        {row.coverUrl ? <img src={row.coverUrl} alt="" loading="lazy" /> : <div className="coverFallback" />}
        {bestDiscount ? (
          <span className={`discountRibbon discountRibbon-${bestDiscount.store}`} aria-label={`Descuento ${bestDiscount.discountPct}%`}>
            -{bestDiscount.discountPct}%
          </span>
        ) : null}
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
          <h3>{row.gameTitle}</h3>
          <button
            className={category === displayGameCategory(row) ? "categoryFilter active" : "categoryFilter"}
            onClick={(event) => {
              event.stopPropagation();
              onCategoryClick(displayGameCategory(row));
            }}
            title="Filtrar por categoría"
          >
            {formatReleaseYear(row.releaseYear)} · {formatCategory(displayGameCategory(row))}
          </button>
        </div>
      </div>

      <div className="gameCardBody">
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
              />
            ))
          ) : (
            <div className="emptyPrices">Sin precios disponibles</div>
          )}
        </div>

        <HistoricalLowStrip lows={historyLows} enabledStores={activeStores} usdToArs={usdToArs} displayCurrency={displayCurrency} displayLocale={displayLocale} onOpen={onOpen} />
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
  price,
  winner,
  index,
  differenceVsSteam,
  displayCurrency,
  displayLocale
}: {
  store: StoreId;
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
      <div className="storeName">
        <StoreLogo store={store} />
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
  displayCurrency,
  displayLocale,
  onOpen
}: {
  lows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  usdToArs: number;
  displayCurrency: string;
  displayLocale: string;
  onOpen?: () => void;
}) {
  const activeStores = enabledStores.length ? enabledStores : STORES;
  const hasAnyLow = activeStores.some((store) => lows[store]?.arsFinalPrice != null);

  return (
    <button className="historyStrip" aria-label="Mínimos históricos" onClick={onOpen}>
      <span className="historyTitle">Mínimos históricos 📉</span>
      <div className="historyColumns">
        {activeStores.map((store) => {
          const low = lows[store];
          return (
            <div className="historyColumn" key={store}>
              <span>{STORE_LABELS[store]}</span>
              <strong>{low ? formatHistoricalOfficialPrice(low, store, usdToArs, displayCurrency, displayLocale) : "Sin dato"}</strong>
            </div>
          );
        })}
      </div>
      {!hasAnyLow ? <small>Se completa al actualizar precios.</small> : null}
    </button>
  );
}

function GameDetailModal({
  row,
  analysis,
  lows,
  enabledStores,
  historyEntries,
  historyLoading,
  usdToArs,
  displayCurrency,
  displayLocale,
  user,
  wishlisted,
  onToggleWishlist,
  onClose
}: {
  row: PriceRow;
  analysis: GameAnalysis | undefined;
  lows: PriceHistoryReport["lowsByGame"][string];
  enabledStores: StoreId[];
  historyEntries: PriceHistoryReport["entriesByGame"][string];
  historyLoading: boolean;
  usdToArs: number;
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
              {formatReleaseYear(row.releaseYear)} · {formatCategory(displayGameCategory(row))}
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
            displayCurrency={displayCurrency}
            displayLocale={displayLocale}
          />
          </section>
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
  displayCurrency: string;
  displayLocale: string;
}) {
  const chartStores = enabledStores.length ? enabledStores : STORES;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; store: StoreId; date: string; price: string } | null>(null);
  const [focusedStore, setFocusedStore] = useState<StoreId | null>(currentWinner && chartStores.includes(currentWinner) ? currentWinner : chartStores[0] ?? null);
  useEffect(() => {
    setFocusedStore(currentWinner && chartStores.includes(currentWinner) ? currentWinner : chartStores[0] ?? null);
  }, [currentWinner, enabledStores, entries]);
  const realChartEntries = dedupeDailyHistoryEntries(
    entries.filter((entry) => chartStores.includes(entry.store) && entry.arsFinalPrice != null && entry.arsFinalPrice > 0)
  );
  const firstEntryDate = realChartEntries.length ? new Date(Math.min(...realChartEntries.map((entry) => Date.parse(entry.timestamp)))) : new Date();
  const endDate = new Date();
  const sixMonthsAgo = new Date(endDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const rangeStart = firstEntryDate.getTime() <= sixMonthsAgo.getTime() ? sixMonthsAgo : firstEntryDate;
  const startDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const chartEntries = buildMonthlyHistoryPoints(realChartEntries, startDate, endDate);
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
  const opacityForStore = (store: StoreId) => (!focusedStore || focusedStore === store ? 1 : 0.1);

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
              .map((entry) => `${x(entry.timestamp)},${y(entry.arsFinalPrice ?? 0)}`)
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
        Últimos 6 meses cuando hay registros suficientes; si no, desde el primer registro real. Se agregan puntos mensuales manteniendo el último precio conocido.
      </small>
      <h4 className="historyLowTitle">MÍNIMOS HISTÓRICOS</h4>
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

function dedupeDailyHistoryEntries(entries: PriceHistoryReport["entriesByGame"][string]): PriceHistoryReport["entriesByGame"][string] {
  const byStoreDay = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const day = new Date(entry.timestamp).toISOString().slice(0, 10);
    const key = `${entry.store}:${day}`;
    const current = byStoreDay.get(key);
    if (!current || Date.parse(entry.timestamp) >= Date.parse(current.timestamp)) {
      byStoreDay.set(key, entry);
    }
  }
  return [...byStoreDay.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function buildMonthlyHistoryPoints(
  entries: PriceHistoryReport["entriesByGame"][string],
  startDate: Date,
  endDate: Date
): PriceHistoryReport["entriesByGame"][string] {
  const byKey = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const time = Date.parse(entry.timestamp);
    if (time < startDate.getTime() || time > endDate.getTime()) continue;
    const day = new Date(entry.timestamp).toISOString().slice(0, 10);
    byKey.set(`${entry.store}:${day}`, entry);
  }

  for (const store of STORES) {
    const storeEntries = entries.filter((entry) => entry.store === store).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (!storeEntries.length) continue;
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12);
    while (cursor.getTime() <= endDate.getTime()) {
      const lastKnown = storeEntries.filter((entry) => Date.parse(entry.timestamp) <= cursor.getTime()).at(-1);
      if (lastKnown) {
        const timestamp = cursor.toISOString();
        const day = timestamp.slice(0, 10);
        const key = `${store}:${day}`;
        if (!byKey.has(key)) byKey.set(key, { ...lastKnown, timestamp, source: "snapshot" });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const lastKnown = storeEntries.filter((entry) => Date.parse(entry.timestamp) <= endDate.getTime()).at(-1);
    if (lastKnown) {
      const timestamp = endDate.toISOString();
      const day = timestamp.slice(0, 10);
      const key = `${store}:${day}`;
      if (!byKey.has(key)) byKey.set(key, { ...lastKnown, timestamp, source: "snapshot" });
    }
  }

  return [...byKey.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function formatCompactCurrency(value: number, currency: string, locale: string): string {
  if (value >= 1000000) return `$${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return formatArs(value, currency, locale);
}

function formatLowDifference(low: number | null, current: number | null): string {
  if (low == null || current == null || low <= 0) return "Sin comparación";
  const pct = Math.round(Math.abs(current / low - 1) * 100);
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
