import type { Metadata } from "next";
import { BibliotecaClient } from "../biblioteca/BibliotecaClient";
import { getCatalogPage } from "@/lib/catalog";
import { AUTUMN_FILTER, AUTUMN_PATH } from "@/lib/autumn-offers";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;
export const metadata: Metadata = pageMetadata("Ofertas de otoño de Steam: selección Shux | BARATEAM", "Nuestra selección de las ofertas de otoño de Steam y todos los juegos en oferta, con precios regionales, descuentos y mínimos históricos.", AUTUMN_PATH);

export default async function AutumnOffersPage() {
  const initialPayload = await getCatalogPage({ filter: AUTUMN_FILTER, sort: "relevancia", limit: 30, refresh: false, useCachedExchangeRate: true });
  return <BibliotecaClient initialPayload={initialPayload} initialFilter={AUTUMN_FILTER} initialSort="relevancia" />;
}
