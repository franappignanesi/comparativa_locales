import type { Metadata } from "next";
import { LandingClient } from "@/app/components/LandingClient";
import { getCatalogPage } from "@/lib/catalog";
import { getLandingStats } from "@/lib/landing-data";
import { DEFAULT_REGION } from "@/lib/regions";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "BARATEAM — Comparador de precios de juegos en Argentina (ARS)",
  description:
    "Compará precios de juegos en Argentina entre Steam, Epic Games, GOG, Humble y Microsoft Store. Ofertas y datos regionales actualizados a diario."
};

export default async function LandingPage() {
  const [initialStats, initialCatalog] = await Promise.all([
    getLandingStats(DEFAULT_REGION),
    getCatalogPage({
      mode: "broad",
      region: DEFAULT_REGION,
      sort: "diferencia",
      limit: 5,
      offset: 0,
      refresh: false,
      useCachedExchangeRate: true
    })
  ]);

  return <LandingClient initialStats={initialStats} initialCatalog={initialCatalog} />;
}
