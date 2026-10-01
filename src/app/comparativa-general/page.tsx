import { pageMetadata } from "@/lib/seo";
import { getLandingStats } from "@/lib/landing-data";
import ComparativaClient from "./ComparativaClient";

export const revalidate = 86400;
export const metadata = pageMetadata("Comparativa de tiendas de juegos para PC | BARATEAM", "Compará Steam, Epic Games, GOG, Humble y Microsoft Store: precios promedio, descuentos y cobertura del catálogo en Argentina.", "/comparativa-general");
export default async function ComparativaPage() {
  return <ComparativaClient initialPayload={await getLandingStats()} />;
}
