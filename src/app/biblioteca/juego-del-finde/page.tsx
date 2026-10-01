import type { Metadata } from "next";
import { BibliotecaClient } from "../BibliotecaClient";
import { getCatalogPage } from "@/lib/catalog";
import { WEEKEND_FILTER } from "@/lib/weekend-games";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;
export const metadata: Metadata = pageMetadata("Juego del finde: recomendaciones de Shux | BARATEAM", "Descubrí los juegos del finde de Shux, mirá las recomendaciones y compará precios entre tiendas oficiales. Calendario y ofertas de nuestra selección.", "/biblioteca/juego-del-finde");

export default async function WeekendGamesPage() {
  const initialPayload = await getCatalogPage({ filter: WEEKEND_FILTER, sort: "recientes", limit: 30, refresh: false, useCachedExchangeRate: true });
  return <BibliotecaClient initialPayload={initialPayload} initialFilter={WEEKEND_FILTER} initialSort="recientes" />;
}
