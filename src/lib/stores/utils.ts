import type { SampleGame } from "../types";

export function storeSlug(game: SampleGame, provided: string | null | undefined): string {
  return provided ?? slugify(game.title);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function comparableTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(the|edition|standard|pc|game|remastered)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function numberFromPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
