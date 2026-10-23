import { STORES, type StoreId } from "./types";
import { REGIONS, type RegionId } from "./regions";
import { MAX_PUBLICATION_IMAGES, type PublicationGame } from "./social-publications";

export type StudioMode = "news" | "story" | "comparison" | "versus" | "giveaway";
export type StudioFormat = "post" | "story";
export type PlateKind = "headline-image" | "text-image" | "text" | "image-caption" | "cta" | "game-offer" | "versus-cover" | "game-feature" | "versus-prices" | "bar-chart" | "giveaway-announcement" | "giveaway-winners";
export const PLATE_LABELS: Record<PlateKind, string> = {
  "headline-image": "Título + imagen", "text-image": "Texto + imagen", text: "Solo texto", "image-caption": "Foto con epígrafe",
  cta: "Cierre / CTA", "game-offer": "Oferta de juego", "versus-cover": "Portada versus", "game-feature": "Presentación de juego",
  "versus-prices": "Comparación de precios", "bar-chart": "Gráfico de barras",
  "giveaway-announcement": "Anuncio del sorteo", "giveaway-winners": "Ganadores del sorteo",
};
export const MODE_PLATES: Record<StudioMode, PlateKind[]> = {
  news: ["headline-image", "text-image", "text", "image-caption", "cta"],
  story: ["game-offer", "cta"], comparison: ["bar-chart"],
  versus: ["versus-cover", "game-feature", "versus-prices", "text-image", "text", "image-caption", "cta"],
  giveaway: ["giveaway-announcement", "giveaway-winners"],
};
export type ChartRow = { id: string; label: string; value: string; image: string | null; showValue: boolean };
export type StudioPlate = {
  id: string; kind: PlateKind; title: string; body: string; eyebrow: string; showEyebrow: boolean;
  image: string | null; coverGameId: string; imageX: number; imageY: number; secondX: number; secondY: number;
  gameSlot: 0 | 1; stores: StoreId[]; discounts: boolean; lows: boolean; reserveLink: boolean;
  rows: ChartRow[]; unit: string; showMoreInfo: boolean; winners: string[];
};
export type StudioDraft = { version: 1; mode: StudioMode; format: StudioFormat; region: RegionId; gameIds: string[]; plates: StudioPlate[] };
export const publicationDimensions = (format: StudioFormat) => ({ width: 1080, height: format === "story" ? 1920 : 1350 });
export function newStudioPlate(kind: PlateKind, id: string): StudioPlate {
  return { id, kind, title: kind === "giveaway-announcement" ? "¡SORTEO!" : kind === "giveaway-winners" ? "¡Tenemos ganadores!" : kind === "cta" ? "¿Qué opinás?" : kind === "bar-chart" ? "Comparativa" : kind === "versus-cover" ? "¿Con cuál te quedás?" : "",
    body: kind === "cta" ? "Compará precios, consultá históricos y creá tu wishlist en BARATEAM 🤙" : "", eyebrow: "LA SELECCIÓN DE SHUX", showEyebrow: false,
    image: null, coverGameId: "", imageX: 50, imageY: 50, secondX: 50, secondY: 50, gameSlot: 0,
    stores: [...STORES], discounts: true, lows: true, reserveLink: kind === "game-offer" || kind === "giveaway-announcement", rows: [], unit: "", showMoreInfo: true, winners: [""] };
}
export function newStudioDraft(mode: StudioMode, region: RegionId, id: () => string): StudioDraft {
  const kinds = mode === "versus" ? ["versus-cover", "game-feature", "game-feature", "versus-prices", "cta"] as PlateKind[]
    : mode === "giveaway" ? MODE_PLATES.giveaway : mode === "news" ? MODE_PLATES.news : mode === "story" ? ["game-offer"] as PlateKind[] : ["bar-chart"] as PlateKind[];
  const plates = kinds.map(kind => newStudioPlate(kind, id()));
  if (mode === "versus") plates[2].gameSlot = 1;
  if (mode === "news") { plates[0].title = "Nueva noticia"; plates.at(-1)!.body = "Seguinos en @shuxteam"; }
  return { version: 1, mode, format: mode === "story" ? "story" : "post", region, gameIds: [], plates };
}

export function moveStudioPlate(plates: StudioPlate[], id: string, direction: -1 | 1) {
  const index = plates.findIndex(plate => plate.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= plates.length) return plates;
  const next = [...plates];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function duplicateStudioPlate(plates: StudioPlate[], id: string, newId: string) {
  const index = plates.findIndex(plate => plate.id === id);
  if (index < 0 || plates.length >= MAX_PUBLICATION_IMAGES) return plates;
  const copy = { ...plates[index], id: newId, stores: [...plates[index].stores], winners: [...plates[index].winners], rows: plates[index].rows.map((row, i) => ({ ...row, id: `${newId}-${i}` })) };
  return [...plates.slice(0, index + 1), copy, ...plates.slice(index + 1)];
}
export function chartNumber(value: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1e12 ? parsed : null;
}
export function studioPrices(game: PublicationGame | undefined, stores: StoreId[]) {
  const prices = game?.prices.filter(price => stores.includes(price.store) && price.amount != null && !price.stale) ?? [];
  const comparable = prices.flatMap(price => price.comparisonAmount != null ? [price.comparisonAmount] : []);
  const cheapest = comparable.length ? Math.min(...comparable) : null;
  return prices.map(price => ({ ...price, cheapest: cheapest == null ? price.cheapest : price.comparisonAmount === cheapest }));
}
export function studioPlateError(plate: StudioPlate, gameIds: string[], games: Record<string, PublicationGame>): string | null {
  if (plate.kind === "giveaway-announcement" || plate.kind === "giveaway-winners") {
    if (!games[gameIds[0]]) return "Elegí el juego del sorteo.";
    if (!plate.image && !games[plate.coverGameId]?.coverUrl && !games[gameIds[0]]?.coverUrl) return "Elegí una portada para el sorteo.";
    if (!plate.title.trim()) return "Completá el título del sorteo.";
    if (plate.kind === "giveaway-winners" && (plate.winners.length < 1 || plate.winners.length > 5 || plate.winners.some(name => !name.trim()))) return "Completá los nombres de los ganadores (de 1 a 5).";
  }
  if (["headline-image", "text-image", "image-caption"].includes(plate.kind) && !plate.image && !games[plate.coverGameId]?.coverUrl && !games[gameIds[plate.gameSlot]]?.coverUrl) return "Elegí una imagen o una portada para esta placa.";
  if ((plate.kind === "text" || plate.kind === "cta") && !plate.title.trim() && !plate.body.trim()) return "Completá el texto de esta placa.";
  if (plate.kind === "bar-chart") {
    if (!plate.rows.length) return "Agregá al menos un elemento al gráfico.";
    if (plate.rows.some(row => !row.label.trim() || chartNumber(row.value) == null)) return "Completá los nombres y valores del gráfico con números positivos o cero.";
  }
  if (plate.kind === "versus-cover" || plate.kind === "versus-prices") {
    if (!gameIds[0] || !gameIds[1] || gameIds[0] === gameIds[1] || !games[gameIds[0]] || !games[gameIds[1]]) return "Elegí dos juegos distintos.";
  }
  const slots = plate.kind === "versus-prices" ? [0, 1] : plate.kind === "game-offer" || plate.kind === "game-feature" ? [plate.gameSlot] : [];
  for (const slot of slots) {
    const game = games[gameIds[slot]];
    if (!game) return "Elegí el juego de esta placa.";
    if ((plate.kind === "game-offer" || plate.kind === "versus-prices") && !studioPrices(game, plate.stores).length) return "No hay precios recientes en las tiendas seleccionadas.";
  }
  return null;
}

function safeImage(value: unknown): string | null {
  return typeof value === "string" && value.length <= 5_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}
export function restoreStudioDraft(value: unknown, mode: StudioMode): StudioDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || data.mode !== mode || !Array.isArray(data.plates) || !REGIONS.some(region => region.id === data.region)) return null;
  const text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
  const position = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  const ids = new Set<string>();
  const plates = data.plates.slice(0, MAX_PUBLICATION_IMAGES).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = text(item.id, 100);
    if (!id || ids.has(id) || !MODE_PLATES[mode].includes(item.kind as PlateKind)) return [];
    ids.add(id);
    const plate = newStudioPlate(item.kind as PlateKind, id);
    Object.assign(plate, { title: text(item.title, 180), body: text(item.body, 1600), eyebrow: text(item.eyebrow, 80), image: safeImage(item.image),
      coverGameId: text(item.coverGameId, 200), imageX: position(item.imageX), imageY: position(item.imageY), secondX: position(item.secondX), secondY: position(item.secondY),
      gameSlot: item.gameSlot === 1 ? 1 : 0, unit: text(item.unit, 20) });
    for (const key of ["showEyebrow", "discounts", "lows", "reserveLink", "showMoreInfo"] as const) if (typeof item[key] === "boolean") plate[key] = item[key];
    if (Array.isArray(item.winners) && item.winners.length) plate.winners = item.winners.slice(0, 5).map(name => text(name, 70));
    const requestedStores = item.stores;
    if (Array.isArray(requestedStores)) plate.stores = STORES.filter(store => requestedStores.includes(store));
    if (Array.isArray(item.rows)) plate.rows = item.rows.slice(0, 12).map((row: Record<string, unknown>, index: number) => ({ id: `${id}-${index}`, label: text(row?.label, 70), value: text(row?.value, 30), image: safeImage(row?.image), showValue: row?.showValue !== false }));
    return [plate];
  });
  return { version: 1, mode, format: data.format === "story" ? "story" : "post", region: data.region as RegionId,
    gameIds: Array.isArray(data.gameIds) ? data.gameIds.slice(0, 2).map(id => text(id, 200)) : [], plates };
}
