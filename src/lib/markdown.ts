import { analyzePrices, type AnalysisSummary, type GameAnalysis } from "./analysis";
import { formatArs } from "./normalize";
import type { GameSample, LatestPrices, NormalizedPrice, StoreId } from "./types";
import { STORES } from "./types";

export function buildMarkdown(latest: LatestPrices, sample: GameSample, mode: "strict" | "broad" = "broad"): string {
  const games = mode === "strict" ? sample.strictSample : sample.broadSample;
  const ids = new Set(games.map((game) => game.id));
  const analysis = analyzePrices(latest, ids);
  const rows = latest.prices.filter((row) => ids.has(row.gameId));

  return [
    `# Comparador de precios de juegos digitales en Argentina`,
    "",
    `Muestra: **${mode}**`,
    `Timestamp precios: **${latest.timestamp ?? "Sin dato"}**`,
    `Dólar tarjeta: **${latest.usdToArs}** (${latest.usdToArsSource ?? "Sin fuente"})`,
    `IVA servicios digitales: **${Math.round((latest.digitalVatRate ?? 0) * 100)}%**`,
    "",
    "## Estadisticas globales",
    "",
    statList(analysis),
    "",
    "## Resumen por tienda",
    "",
    markdownTable(
      ["Tienda", "Índice", "Victorias", "Con oferta", "Sin oferta", "Juegos", "Con descuento", "Desc. prom.", "Promedio ARS+IVA"],
      STORES.map((store) => [
        storeLabel(store),
        formatIndex(analysis.priceIndexByStore[store]),
        String(analysis.winsByStore[store] ?? 0),
        String(analysis.discountedWinsByStore[store] ?? 0),
        String(analysis.nonDiscountedWinsByStore[store] ?? 0),
        String(analysis.coverageByStore[store] ?? 0),
        String(analysis.offersByStore[store] ?? 0),
        formatPercent(analysis.averageDiscountByStore[store]),
        formatArs(analysis.averageByStore[store])
      ])
    ),
    "",
    "## Mayores diferencias vs Steam",
    "",
    markdownTable(
      ["Juego", "Ganador", "Diferencia vs Steam", "Estado"],
      analysis.bestDifferences.map((item) => {
        const row = rows.find((priceRow) => priceRow.gameId === item.gameId);
        return [
          row?.gameTitle ?? item.gameId,
          item.winner ? storeLabel(item.winner) : "Sin ganador",
          item.differenceVsSteam == null ? "Sin dato" : formatArs(item.differenceVsSteam),
          row?.comparisonStatus ?? "Sin dato"
        ];
      })
    ),
    "",
    "## Tabla de precios",
    "",
    markdownTable(
      ["Juego", "Categoria", "Anio", "Steam", "Epic", "GOG", "Humble", "Microsoft", "Ganador", "Estado"],
      rows.map((row) => {
        const gameAnalysis = analysis.games[row.gameId];
        return [
          row.gameTitle,
          row.category,
          String(row.releaseYear),
          ...STORES.map((store) => markdownPrice(row.prices[store], gameAnalysis, store)),
          gameAnalysis?.winner ? storeLabel(gameAnalysis.winner) : "Sin ganador",
          row.comparisonStatus
        ];
      })
    )
  ].join("\n");
}

function statList(analysis: AnalysisSummary): string {
  return [
    `- Juegos analizados: **${analysis.gamesAnalyzed}**`,
    `- Datos completos: **${analysis.completeDataGames}**`,
    `- Datos faltantes: **${analysis.missingDataGames}**`,
    `- Tienda mas barata promedio: **${analysis.cheapestAverageStore ? storeLabel(analysis.cheapestAverageStore) : "Sin dato"}**`,
    `- Mas victorias: **${analysis.mostWinsStore ? storeLabel(analysis.mostWinsStore) : "Sin dato"}**`
  ].join("\n");
}

function markdownPrice(
  price: NormalizedPrice | undefined,
  gameAnalysis: GameAnalysis | undefined,
  store: StoreId
): string {
  if (!price?.available) return "unavailable";
  if (price.arsFinalPrice == null) return `sin precio (${price.source ?? "provider"})`;
  const official = price.url ? `[${officialPrice(price)}](${price.url})` : officialPrice(price);
  return `${official}<br>${formatArs(price.arsFinalPrice)} ARS+IVA<br>Desc. ${formatPercent(price.discountPct)} / Dif. ${formatIndex(gameAnalysis?.priceIndex[store])}`;
}

function officialPrice(price: NormalizedPrice): string {
  if (price.originalFinalPrice == null || !price.originalCurrency) return "Sin dato";
  if (price.originalCurrency.toUpperCase() === "ARS") return formatArs(price.originalFinalPrice);
  return `${price.originalCurrency} ${price.originalFinalPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(escapeMarkdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`)
  ].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
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
