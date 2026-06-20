"use client";

import { BarChart3, Flame, History, Library, ShieldAlert, Star, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu, WishlistGame } from "@/app/components/UserMenu";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import {
  fetchWishlist,
  fetchWishlistAlerts,
  persistSession,
  readStoredUser,
  type WishlistAlert
} from "@/app/components/userPersistence";
import { formatGameCategory } from "@/lib/categories";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { isAdminEmail } from "@/lib/admin";
import type { AnalysisSummary } from "@/lib/analysis";
import { formatArs } from "@/lib/normalize";
import { STORE_LOGOS } from "@/lib/store-assets";
import { STORES, type StoreId } from "@/lib/types";

type StatsPayload = {
  timestamp: string | null;
  usdToArs: number;
  usdToArsSource?: string;
  digitalVatRate?: number;
  sampleMeta: {
    strictTotal: number;
    broadTotal: number;
    rejectedTotal: number;
    storeCoverage: Partial<Record<StoreId, number>>;
    categoryCoverage: Record<string, number>;
    categoryCoverageComparable?: Record<string, number>;
  };
  analysis: {
    strict: Omit<AnalysisSummary, "games">;
    broad: Omit<AnalysisSummary, "games">;
  };
};

const STORE_LABELS: Record<StoreId, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft"
};

const SIDEBAR_ITEMS = [
  { href: "/", label: "Inicio", icon: Library },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/comparativa-general", label: "Comparativa general", icon: BarChart3 },
  { href: "/biblioteca?filter=ofertas", label: "Ofertas", icon: Flame },
  { href: "/biblioteca?filter=diferencias", label: "Bajadas de precio", icon: TrendingDown },
  { href: "/biblioteca", label: "Mínimos históricos", icon: History }
];

export default function ComparativaGeneralPage() {
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [alerts, setAlerts] = useState<WishlistAlert[]>([]);

  useEffect(() => {
    setUser(readStoredUser());
    const storedRegion = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (storedRegion) setRegion(storedRegion);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/stats?region=${region}`, { signal: controller.signal })
      .then((res) => res.json())
      .then(setPayload)
      .catch((error) => {
        if (error?.name !== "AbortError") console.error(error);
      });
    return () => controller.abort();
  }, [region]);

  useEffect(() => {
    if (!user) {
      setWishlist([]);
      setAlerts([]);
      return;
    }

    let cancelled = false;
    fetchWishlist(user.sub)
      .then((items) => {
        if (!cancelled) setWishlist(items);
      })
      .catch(() => {
        if (!cancelled) setWishlist([]);
      });
    fetchWishlistAlerts(user.sub, region)
      .then((items) => {
        if (!cancelled) setAlerts(items);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user, region]);

  const handleRegionChange = (nextRegion: RegionId) => {
    setRegion(nextRegion);
    window.localStorage.setItem("glitchprice-region", nextRegion);
  };

  const handleUserChange = (nextUser: GoogleUser | null) => {
    setUser(nextUser);
    if (nextUser) {
      persistSession(nextUser);
    } else {
      window.localStorage.removeItem("glitchprice-user");
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setWishlist([]);
    setAlerts([]);
    window.localStorage.removeItem("glitchprice-user");
  };

  if (!payload) {
    return (
      <div className="appShell">
        <nav className="brandBar">
          <div className="brandCluster">
            <Link className="brand" href="/">
              BARATEAM
            </Link>
          </div>
        </nav>
        <main className="page">
          <p className="loading">Cargando comparativa...</p>
        </main>
      </div>
    );
  }

  const summary = payload.analysis.broad;
  const cheapestAverage = summary.cheapestAverageStore;
  const mostWins = summary.mostWinsStore;
  const bestDiscountStore = maxStore(summary.averageDiscountByStore);
  const rankedRows = rankedStoreRows(summary);
  const orderedCoverage = [...STORES].sort(
    (a, b) => (summary.coverageByStore[b] ?? 0) - (summary.coverageByStore[a] ?? 0)
  );
  const categoryEntries = Object.entries(
    payload.sampleMeta.categoryCoverageComparable ?? payload.sampleMeta.categoryCoverage
  ).sort(([, a], [, b]) => b - a);
  const maxCategory = Math.max(...categoryEntries.map(([, value]) => value), 1);

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <Link className="brand" href="/">
            BARATEAM
          </Link>
        </div>
        <div className="navTools">
          <ProblemReportButton user={user} />
          <Link className="wishlistNavButton" href="/wishlist">
            <Star size={15} />
            Mi lista
            {alerts.length > 0 ? <span className="alert">{alerts.length}</span> : null}
          </Link>
          <RegionSelector value={region} onChange={handleRegionChange} />
          <UserMenu user={user} onUserChange={handleUserChange} onSignOut={handleSignOut} />
        </div>
      </nav>

      <aside className="sideNav">
        <div className="sideHeader">
          <h2>Análisis</h2>
          <p>Mercado regional</p>
        </div>
        <div className="sideLinks">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/comparativa-general";
            return (
              <Link key={item.href} className={active ? "sideLink active" : "sideLink"} href={item.href}>
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
          {isAdminEmail(user?.email) ? (
            <Link className="sideLink adminSideLink" href="/admin/reportes">
              <ShieldAlert size={20} />
              Reportes
            </Link>
          ) : null}
        </div>
      </aside>

      <main className="page">
        <header className="heroHeader">
          <div>
            <span className="eyebrow">Comparativa general</span>
            <h1>Lectura del mercado por tienda</h1>
          </div>
        </header>

        <section className="compareHero">
          <ExecutiveCard
            label="Tienda más barata promedio"
            store={cheapestAverage}
            value={cheapestAverage ? formatArs(summary.averageByStore[cheapestAverage] ?? null) : "Sin datos"}
            detail="Promedio entre juegos con precio actual."
          />
          <ExecutiveCard
            label="Tienda con más victorias"
            store={mostWins}
            value={mostWins ? String(summary.winsByStore[mostWins] ?? 0) : "Sin datos"}
            detail="Cantidad de juegos que se consiguen más baratos que en el resto de plataformas."
          />
          <ExecutiveCard
            label="Mayor agresividad de descuentos"
            store={bestDiscountStore}
            value={bestDiscountStore ? `${Math.round(summary.averageDiscountByStore[bestDiscountStore] ?? 0)}%` : "Sin datos"}
            detail={bestDiscountStore ? `${summary.offersByStore[bestDiscountStore] ?? 0} juegos en oferta.` : "Promedio de descuento por tienda."}
          />
          <article className="executiveCard compareTotals">
            <span>Catálogo auditable</span>
            <strong>{payload.sampleMeta.broadTotal}</strong>
            <small>{summary.gamesAnalyzed} juegos con precio actual.</small>
          </article>
        </section>

        <section className="storeRankingPanel">
          <div className="sectionHeading">
            <div>
              <span>Ranking por tienda</span>
              <h2>Precio, cobertura y comportamiento comercial</h2>
            </div>
          </div>
          <div className="rankingTable">
            <div className="rankingHeader">
              <span>Tienda</span>
              <span>Promedio</span>
              <span>Índice</span>
              <span>Victorias</span>
              <span>Ofertas</span>
              <span>Descuento</span>
              <span>Cobertura</span>
            </div>
            {rankedRows.map((row) => (
              <div className="rankingRow" key={row.store}>
                <div className="rankingStore">
                  <img className="storeLogo large" src={STORE_LOGOS[row.store]} alt="" aria-hidden="true" />
                  <strong>{STORE_LABELS[row.store]}</strong>
                </div>
                <strong>{formatArs(row.average)}</strong>
                <span>{formatIndex(row.index)}</span>
                <span>{row.wins}</span>
                <span>{row.offers}</span>
                <span>{Math.round(row.discount)}%</span>
                <span>{row.coverage}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="chartsPanel standaloneCharts compareCharts">
          <div className="sectionHeading">
            <div>
              <span>Gráficos por tienda</span>
              <h2>Comparativa general</h2>
            </div>
          </div>
          <div className="featuredCharts compactCharts">
            <PodiumChart title="Victorias totales" values={storeValues(summary.winsByStore)} />
            <DualBarChart
              title="Ofertas y descuentos"
              primary={storeValues(summary.offersByStore)}
              secondary={storeValues(summary.averageDiscountByStore)}
            />
          </div>
        </section>

        <section className="comparisonBands polishedBands">
          <article>
            <div className="sectionHeading compact">
              <div>
                <span>Cobertura por tienda</span>
                <h2>Fuentes con más datos disponibles</h2>
              </div>
            </div>
            <div className="coverageList">
              {orderedCoverage.map((store) => (
                <div key={store} className="coverageItem">
                  <div className="storeInline">
                    <img className="storeLogo" src={STORE_LOGOS[store]} alt="" aria-hidden="true" />
                    <span>{STORE_LABELS[store]}</span>
                  </div>
                  <strong>{summary.coverageByStore[store] ?? 0}</strong>
                </div>
              ))}
            </div>
          </article>

          <article>
            <div className="sectionHeading compact">
              <div>
                <span>Distribución del catálogo</span>
                <h2>Géneros principales</h2>
              </div>
            </div>
            <div className="genreBars">
              {categoryEntries.map(([category, value]) => (
                <div className="genreRow" key={category}>
                  <span>{formatGameCategory(category)}</span>
                  <div className="barTrack">
                    <span style={{ width: `${Math.max(4, (value / maxCategory) * 100)}%` }} />
                  </div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="bandNote">
              Según primary tag de Steam. La clasificación queda fija al incorporar cada juego para evitar variaciones artificiales.
            </p>
          </article>
        </section>

        <details className="methodDetails">
          <summary>Metodología y alcance</summary>
          <div>
            <p>
              La comparativa usa juegos con precio en al menos dos tiendas para evitar que una fuente gane por cobertura y no por precio.
            </p>
            <p>
              Última actualización: <strong>{payload.timestamp ? new Date(payload.timestamp).toLocaleString("es-AR") : "sin datos"}</strong>.
            </p>
            <p>
              Dólar tarjeta AR: <strong>{formatArs(payload.usdToArs)}</strong>. IVA digital AR:{" "}
              <strong>{Math.round((payload.digitalVatRate ?? 0) * 100)}%</strong>. Juegos rechazados:{" "}
              <strong>{payload.sampleMeta.rejectedTotal}</strong>.
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}

function ExecutiveCard({
  label,
  store,
  value,
  detail
}: {
  label: string;
  store: StoreId | null;
  value: string;
  detail: string;
}) {
  return (
    <article className="executiveCard">
      <span>{label}</span>
      {store ? (
        <div className="executiveIdentity">
          <img className="storeLogo" src={STORE_LOGOS[store]} alt="" aria-hidden="true" />
          <div>
            <small>{STORE_LABELS[store]}</small>
            <strong>{value}</strong>
          </div>
        </div>
      ) : (
        <strong>{value}</strong>
      )}
      <small>{detail}</small>
    </article>
  );
}

function PodiumChart({ title, values }: { title: string; values: Array<{ store: StoreId; value: number }> }) {
  const ordered = [...values].sort((a, b) => b.value - a.value).slice(0, 3);
  return (
    <article className="chartCard">
      <h3>{title}</h3>
      <div className="podium">
        {ordered.map((item, index) => (
          <div className="podiumStep" key={item.store}>
            <span>#{index + 1}</span>
            <img className="storeLogo" src={STORE_LOGOS[item.store]} alt="" aria-hidden="true" />
            <strong>{Math.round(item.value)}</strong>
            <small>{STORE_LABELS[item.store]}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function DualBarChart({
  title,
  primary,
  secondary
}: {
  title: string;
  primary: Array<{ store: StoreId; value: number }>;
  secondary: Array<{ store: StoreId; value: number }>;
}) {
  const maxPrimary = Math.max(...primary.map((item) => item.value), 1);
  const maxSecondary = Math.max(...secondary.map((item) => item.value), 1);
  return (
    <article className="chartCard">
      <h3>{title}</h3>
      <div className="dualBars">
        {primary.map((item) => {
          const discount = secondary.find((entry) => entry.store === item.store)?.value ?? 0;
          return (
            <div className="dualRow" key={item.store}>
              <div className="storeInline">
                <img className="storeLogo" src={STORE_LOGOS[item.store]} alt="" aria-hidden="true" />
                <span>{STORE_LABELS[item.store]}</span>
              </div>
              <div className="dualTracks">
                <div className="dualTrack primary">
                  <span style={{ width: `${Math.max(4, (item.value / maxPrimary) * 100)}%` }} />
                </div>
                <div className="dualTrack secondary">
                  <span style={{ width: `${Math.max(4, (discount / maxSecondary) * 100)}%` }} />
                </div>
              </div>
              <strong>
                {Math.round(item.value)} / {Math.round(discount)}%
              </strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function rankedStoreRows(summary: Omit<AnalysisSummary, "games">) {
  return STORES.map((store) => ({
    store,
    average: summary.averageByStore[store] ?? null,
    index: summary.priceIndexByStore[store] ?? 0,
    wins: summary.winsByStore[store] ?? 0,
    offers: summary.offersByStore[store] ?? 0,
    discount: summary.averageDiscountByStore[store] ?? 0,
    coverage: summary.coverageByStore[store] ?? 0
  })).sort((a, b) => {
    if (a.average == null && b.average == null) return 0;
    if (a.average == null) return 1;
    if (b.average == null) return -1;
    return a.average - b.average;
  });
}

function storeValues(values: Partial<Record<StoreId, number | null>>) {
  return STORES.map((store) => ({
    store,
    value: values[store] ?? 0
  }));
}

function maxStore(values: Partial<Record<StoreId, number | null>>) {
  return STORES.reduce<StoreId | null>((best, store) => {
    if (best === null) return store;
    return (values[store] ?? Number.NEGATIVE_INFINITY) > (values[best] ?? Number.NEGATIVE_INFINITY) ? store : best;
  }, null);
}

function formatIndex(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "0%";
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}
