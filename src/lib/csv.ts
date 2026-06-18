import { analyzePrices, type AnalysisSummary, type GameAnalysis } from "./analysis";
import { formatArs } from "./normalize";
import type { GameSample, LatestPrices, NormalizedPrice, StoreId } from "./types";
import { STORES } from "./types";

export function buildCsv(latest: LatestPrices, sample: GameSample, mode: "strict" | "broad" = "broad"): string {
  const games = mode === "strict" ? sample.strictSample : sample.broadSample;
  const ids = new Set(games.map((game) => game.id));
  const analysis = analyzePrices(latest, ids);
  const rows = latest.prices.filter((row) => ids.has(row.gameId));

  return [
    ...buildGlobalStats(latest, analysis, mode),
    [],
    ["Resumen por tienda"],
      ["Tienda", "Índice precio", "Victorias", "Victorias con oferta", "Victorias sin oferta", "Juegos con precio", "Juegos con descuento", "Descuento promedio", "Promedio ARS+IVA", "Mediana ARS+IVA"],
    ...STORES.map((store) => [
      storeLabel(store),
      formatIndex(analysis.priceIndexByStore[store]),
      String(analysis.winsByStore[store] ?? 0),
      String(analysis.discountedWinsByStore[store] ?? 0),
      String(analysis.nonDiscountedWinsByStore[store] ?? 0),
      String(analysis.coverageByStore[store] ?? 0),
      String(analysis.offersByStore[store] ?? 0),
      formatPercent(analysis.averageDiscountByStore[store]),
      formatArs(analysis.averageByStore[store]),
      formatArs(analysis.medianByStore[store])
    ]),
    [],
    ["Tabla de precios"],
    buildPriceHeader(),
    ...rows.map((row) => {
      const gameAnalysis = analysis.games[row.gameId];
      return [
        row.gameTitle,
        row.category,
        String(row.releaseYear),
        ...STORES.flatMap((store) => storePriceColumns(row.prices[store], gameAnalysis, store)),
        gameAnalysis?.winner ? storeLabel(gameAnalysis.winner) : "Sin ganador",
        gameAnalysis?.differenceVsSteam == null ? "Sin dato" : formatArs(gameAnalysis.differenceVsSteam),
        row.comparisonStatus
      ];
    })
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

function buildGlobalStats(
  latest: LatestPrices,
  analysis: AnalysisSummary,
  mode: "strict" | "broad"
): string[][] {
  return [
    ["Estadisticas globales"],
    ["Muestra", mode],
    ["Timestamp precios", latest.timestamp ?? "Sin dato"],
    ["Dólar tarjeta", String(latest.usdToArs)],
    ["Fuente dolar", latest.usdToArsSource ?? "Sin dato"],
    ["IVA servicios digitales", formatPercent((latest.digitalVatRate ?? 0) * 100)],
    ["Juegos analizados", String(analysis.gamesAnalyzed)],
    ["Datos completos", String(analysis.completeDataGames)],
    ["Datos faltantes", String(analysis.missingDataGames)],
    ["Tienda mas barata promedio", analysis.cheapestAverageStore ? storeLabel(analysis.cheapestAverageStore) : "Sin dato"],
    ["Mas victorias", analysis.mostWinsStore ? storeLabel(analysis.mostWinsStore) : "Sin dato"]
  ];
}

function buildPriceHeader(): string[] {
  return [
    "Juego",
    "Categoria",
    "Anio",
    ...STORES.flatMap((store) => [
      `${storeLabel(store)} disponibilidad`,
      `${storeLabel(store)} oficial`,
      `${storeLabel(store)} ARS+IVA`,
      `${storeLabel(store)} descuento`,
      `${storeLabel(store)} diferencia`
    ]),
    "Ganador",
    "Diferencia vs Steam",
    "Estado"
  ];
}

function storePriceColumns(
  price: NormalizedPrice | undefined,
  gameAnalysis: GameAnalysis | undefined,
  store: StoreId
): string[] {
  if (!price?.available) return ["unavailable", "", "", "", ""];
  if (price.arsFinalPrice == null) return ["sin precio", officialPrice(price), "", formatPercent(price.discountPct), "Sin dato"];
  return [
    price.source ?? "provider",
    officialPrice(price),
    formatArs(price.arsFinalPrice),
    formatPercent(price.discountPct),
    formatIndex(gameAnalysis?.priceIndex[store])
  ];
}

function officialPrice(price: NormalizedPrice): string {
  if (price.originalFinalPrice == null || !price.originalCurrency) return "Sin dato";
  if (price.originalCurrency.toUpperCase() === "ARS") return formatArs(price.originalFinalPrice);
  return `${price.originalCurrency} ${price.originalFinalPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function formatIndex(value: number | null | undefined): string {
  if (value == null) return "Sin dato";
  return value === 0 ? "0%" : `+${value}%`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "0%";
  return `${Math.round(value)}%`;
}

function storeLabel(store: StoreId): string {
  const labels: Record<StoreId, string> = {
    steam: "Steam",
    epic: "Epic",
    gog: "GOG",
    humble: "Humble",
    microsoft: "Microsoft"
  };
  return labels[store];
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
