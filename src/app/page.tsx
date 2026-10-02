import type { Metadata } from "next";
import { LandingClient } from "@/app/components/LandingClient";
import { getCatalogPage } from "@/lib/catalog";
import { getLandingStats } from "@/lib/landing-data";
import { DEFAULT_REGION } from "@/lib/regions";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = pageMetadata("BARATEAM | Precios y ofertas de juegos en Argentina", "Compará precios de juegos para PC en Steam, Epic Games, GOG, Humble y Microsoft Store. Ofertas, precios en pesos y mínimos históricos actualizados a diario.", "/");

export default async function LandingPage() {
  const [initialStats, initialCatalog] = await Promise.all([
    getLandingStats(DEFAULT_REGION),
    getCatalogPage({
      mode: "broad",
      region: DEFAULT_REGION,
      sort: "diferencia",
      limit: 6,
      offset: 0,
      refresh: false,
      useCachedExchangeRate: true
    })
  ]);

  return <LandingClient initialStats={initialStats} initialCatalog={initialCatalog} />;
}
