import type { GameCandidate, StoreId } from "./types";

export type SuggestionStatus = "pending" | "queued" | "searching" | "ready" | "review" | "approved" | "publishing" | "published" | "discarded";
export type SuggestionLink = { store: StoreId; storeId: string; url: string };
export type SuggestionPreview = SuggestionLink & { title: string | null; coverUrl: string | null; existingGameId: string | null };
export type GameSuggestion = SuggestionPreview & {
  id: string; status: SuggestionStatus; createdAt: string; updatedAt: string;
  supporters: number; message: string | null; candidate: GameCandidate | null; gameId: string | null;
};
export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: "Pendiente", queued: "Búsqueda en cola", searching: "Buscando", ready: "Listo para revisar",
  review: "Requiere revisión", approved: "Incorporación en cola", publishing: "Pendiente de publicación",
  published: "Publicado", discarded: "Descartado"
};
