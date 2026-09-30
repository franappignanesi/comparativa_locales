import type { Metadata } from "next";
import { BibliotecaClient } from "../BibliotecaClient";
import { getCatalogPage } from "@/lib/catalog";
import { WEEKEND_FILTER } from "@/lib/weekend-games";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "Juego del finde de Shux | BARATEAM",
  description: "Descubrí los juegos del finde de Shux, mirá las recomendaciones y compará precios entre tiendas oficiales. Calendario y ofertas de nuestra selección.",
  alternates: { canonical: "/biblioteca/juego-del-finde" },
};

export default async function WeekendGamesPage() {
  const initialPayload = await getCatalogPage({ filter: WEEKEND_FILTER, sort: "recientes", limit: 30, refresh: false, useCachedExchangeRate: true });
  return <BibliotecaClient initialPayload={initialPayload} initialFilter={WEEKEND_FILTER} initialSort="recientes" />;
}
