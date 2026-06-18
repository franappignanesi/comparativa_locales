"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Cpu, Gauge, Trophy } from "lucide-react";
import { RegionSelector } from "@/app/components/RegionSelector";
import { fetchNotificationSettings, readStoredUser } from "@/app/components/userPersistence";
import { formatArs } from "@/lib/normalize";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import type { AnalysisSummary, GameAnalysis } from "@/lib/analysis";
import type { GameCategory, LatestPrices, StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";

type CompactSummary = Omit<AnalysisSummary, "games">;

type StatsPayload = {
  timestamp: string | null;
  currency?: string;
  locale?: string;
  sampleMeta: {
    categoryCoverage: Partial<Record<GameCategory, number>>;
    categoryCoverageComparable?: Record<string, number>;
  };
  analysis: {
    broad: CompactSummary;
  };
};

type CatalogPayload = {
  latest: LatestPrices;
  analysis: {
    broad: {
      games: Record<string, GameAnalysis>;
    };
  };
};

const STORE_LABELS: Record<StoreId, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft Store"
};

export function LandingClient() {
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>([...STORES]);

  useEffect(() => {
    const saved = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (saved) setRegion(saved);
    const user = readStoredUser();
    if (user) fetchNotificationSettings(user.sub).then((settings) => setEnabledStores(settings.enabledStores?.length ? settings.enabledStores : [...STORES]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetch(`/api/stats?region=${region}`, { signal: controller.signal }).then((res) => res.json()),
      fetch(`/api/catalog?mode=broad&region=${region}&sort=diferencia&limit=5&offset=0`, { signal: controller.signal }).then((res) => res.json())
    ])
      .then(([nextStats, nextCatalog]) => {
        setStats(nextStats);
        setCatalog(nextCatalog);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") console.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [region]);

  const summary = stats?.analysis.broad ?? null;
  const currentRegion = REGIONS.find((item) => item.id === region) ?? REGIONS[0];
  const displayCurrency = stats?.currency ?? catalog?.latest.currency ?? "ARS";
  const displayLocale = stats?.locale ?? catalog?.latest.locale ?? "es-AR";
  const totalGames = summary?.gamesAnalyzed ?? 0;
  const maxCoverage = Math.max(1, totalGames);
  const maxAverage = Math.max(1, ...STORES.map((store) => summary?.averageByStore[store] ?? 0));
  const categoryCoverage = stats?.sampleMeta.categoryCoverageComparable ?? stats?.sampleMeta.categoryCoverage ?? {};
  const categoryTotal = Object.values(categoryCoverage).reduce((sum, value) => sum + (value ?? 0), 0) || 1;
  const marketDistributionRows = useMemo(() => compactMarketDistribution(categoryCoverage), [categoryCoverage]);
  const coverageStores = useMemo(
    () => [...STORES].sort((a, b) => (summary?.coverageByStore[b] ?? 0) - (summary?.coverageByStore[a] ?? 0)),
    [summary]
  );
  const rows = catalog?.latest.prices ?? [];
  const analyses = catalog?.analysis.broad.games ?? {};

  return (
    <main className="landing">
      <nav className="landingNav">
        <Link href="/" className="landingBrand">
          GlitchPrice
        </Link>
        <div className="landingNavTools">
          <RegionSelector value={region} onChange={setRegion} />
          <Link href="/biblioteca" className="landingNavButton">
            Explorar juegos
          </Link>
        </div>
      </nav>

      <section className="landingHero">
        <span className="heroPill">Actualización diaria</span>
        <h1>Dónde conviene comprar juegos digitales en {currentRegion.label}</h1>
        <p>
          Compará precios de juegos en distintas tiendas oficiales, buscá ofertas y analizá datos regionales en{" "}
          {currentRegion.currency}.
        </p>
        <div className="heroActions">
          <Link href="/biblioteca" className="landingPrimary">
            Explorar juegos
          </Link>
          <a href="#herramientas" className="landingSecondary">
            Otras herramientas
          </a>
        </div>
      </section>

      <section className="landingSection" aria-busy={loading}>
        <SectionTitle>Data Dashboard</SectionTitle>
        <div className="dashboardGrid">
          <article className="landingPanel indexPanel">
            <div className="panelHeader">
              <h2>Índice de precio promedio</h2>
              <span>{displayCurrency} por tienda</span>
            </div>
            <div className="indexBars">
              {STORES.map((store) => {
                const value = summary?.averageByStore[store] ?? null;
                const width = value == null ? 0 : Math.max(4, Math.round((value / maxAverage) * 100));
                return (
                  <div className="indexRow" key={store}>
                    <div>
                      <strong>{STORE_LABELS[store]}</strong>
                      <span>{value == null ? "Sin datos" : formatArs(value, displayCurrency, displayLocale)}</span>
                    </div>
                    <div className="landingTrack">
                      <span style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="landingPanel trophyPanel">
            <Trophy size={34} />
            <strong>{summary?.winsByStore[summary.mostWinsStore ?? "steam"] ?? 0}</strong>
            <span>victorias {summary?.mostWinsStore ? STORE_LABELS[summary.mostWinsStore] : "sin tienda"}</span>
            <p>Cantidad de juegos que se consiguen más baratos que en el resto de plataformas.</p>
          </article>

          <article className="landingPanel coveragePanel">
            <h2>Cobertura por tienda</h2>
            {coverageStores.map((store) => (
              <div className="coverageRow" key={store}>
                <span>{percent((summary?.coverageByStore[store] ?? 0) / maxCoverage)}%</span>
                <strong>{STORE_LABELS[store]}</strong>
              </div>
            ))}
          </article>

          <article className="landingPanel discountPanel">
            <h2>Agresividad de descuentos</h2>
            {STORES.map((store) => (
              <div key={store}>
                <strong>{Math.round(summary?.averageDiscountByStore[store] ?? 0)}%</strong>
                <span>{STORE_LABELS[store]}</span>
                <em>{summary?.offersByStore[store] ?? 0} juegos</em>
              </div>
            ))}
          </article>
        </div>
      </section>

      <section className="landingSection">
        <div className="sectionSplit">
          <div>
            <SectionTitle>Arbitraje de precios</SectionTitle>
            <p>Top 5 mayores diferencias de precio detectadas contra Steam.</p>
          </div>
          <Link href="/biblioteca?sort=diferencia" className="completeLink">
            Ver lista completa <ArrowRight size={16} />
          </Link>
        </div>
        <div className="arbitrageGrid">
          {rows.map((row) => {
            const analysis = analyses[row.gameId];
            const winnerStore = bestEnabledStore(row, enabledStores);
            const winner = winnerStore ? row.prices[winnerStore] : null;
            return (
              <Link href="/biblioteca" className="arbitrageCard" key={row.gameId}>
                {row.coverUrl ? <img src={row.coverUrl} alt="" /> : <span className="arbitrageFallback" />}
                <span className="diffBadge">
                  {analysis?.differenceVsSteam == null
                    ? "sin dato"
                    : `${formatArs(analysis.differenceVsSteam, displayCurrency, displayLocale)} vs Steam`}
                </span>
                <div>
                  <h3>{row.gameTitle}</h3>
                  <p>{winnerStore ? STORE_LABELS[winnerStore] : "Sin ganador"}</p>
                </div>
                <strong>
                  {winner?.arsFinalPrice == null ? "Sin dato" : formatArs(winner.arsFinalPrice, displayCurrency, displayLocale)}
                </strong>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="marketBand">
        <div className="totalGames">
          <strong>{totalGames}</strong>
          <span>juegos analizados</span>
        </div>
        <div className="marketDistribution">
          <h2>Distribución por género</h2>
          {marketDistributionRows
            .map(([label, count]) => (
              <MarketRow key={label} label={label} value={percentLabel((count ?? 0) / categoryTotal)} />
            ))}
          <p>La muestra prioriza lanzamientos recientes, indies populares y juegos con presencia real en tiendas regionales.</p>
        </div>
      </section>

      <div className="centerCta">
        <Link href="/biblioteca" className="landingPrimary">
          Explorar juegos
        </Link>
      </div>

      <section className="toolsBlock" id="herramientas">
        <h2>Otras herramientas de Shux</h2>
        <div>
          <button className="comingSoonTool" type="button" aria-label="Comparador de GPUs, proximamente">
            <Gauge size={15} />
            Comparador de GPUs
            <span>Proximamente!</span>
          </button>
          <button className="comingSoonTool" type="button" aria-label="Comparador de CPUs, proximamente">
            <Cpu size={15} />
            Comparador de CPUs
            <span>Proximamente!</span>
          </button>
        </div>
      </section>

      <footer className="landingFooter">
        <strong>GlitchPrice</strong>
        <div>
          <span>GPU Comparator</span>
          <span>CPU Comparator</span>
          <span>Privacy Policy</span>
          <span>Contact</span>
        </div>
        <p>© 2026 GlitchPrice by Shux. Precios calculados con datos regionales oficiales y caches auditables.</p>
      </footer>
    </main>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="landingSectionTitle">
      <span />
      {children}
    </h2>
  );
}

function MarketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="marketRow">
      <span />
      <strong>{label}</strong>
      <em>{value}</em>
    </div>
  );
}

function percent(value: number): number {
  return Math.round(value * 100);
}

function percentLabel(value: number): string {
  if (value > 0 && value < 0.01) return "<1%";
  return `${Math.round(value * 100)}%`;
}

function compactMarketDistribution(coverage: Partial<Record<string, number>>): [string, number][] {
  const sorted = Object.entries(coverage)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const top = sorted.slice(0, 5) as [string, number][];
  const otherTotal = sorted.slice(5).reduce((sum, [, count]) => sum + (count ?? 0), 0);
  return otherTotal > 0 ? [...top, ["Otros", otherTotal]] : top;
}

function bestEnabledStore(row: LatestPrices["prices"][number], enabledStores: StoreId[]): StoreId | null {
  const activeStores = enabledStores.length ? enabledStores : STORES;
  return activeStores
    .filter((store) => row.prices[store]?.available && row.prices[store]?.arsFinalPrice != null)
    .sort((a, b) => (row.prices[a]?.arsFinalPrice ?? Number.MAX_SAFE_INTEGER) - (row.prices[b]?.arsFinalPrice ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
}
