import type { Metadata } from "next";
import { BibliotecaClient } from "./BibliotecaClient";
import { getCatalogPage, type CatalogParams } from "@/lib/catalog";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getGameSample } from "@/lib/sample-builder";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const sample = await getGameSample();
  return pageMetadata("Biblioteca: precios y ofertas de juegos para PC | BARATEAM", `Compará precios de ${sample.broadSample.length} juegos para PC entre Steam, Epic, GOG, Humble y Microsoft Store. Ofertas y mínimos históricos con actualización diaria.`, "/biblioteca");
}

export default async function BibliotecaPage() {
  const initialPayload = await getCatalogPage({
    mode: "broad",
    query: "",
    category: "todas",
    filter: "todos",
    sort: "diferencia",
    region: parseRegion(""),
    limit: 30,
    offset: 0,
    refresh: false,
    useCachedExchangeRate: true
  } satisfies CatalogParams);

  return <BibliotecaClient initialPayload={initialPayload} />;
}

function parseRegion(value: string): RegionId {
  return REGIONS.some((region) => region.id === value) ? (value as RegionId) : DEFAULT_REGION;
}
