import { pageMetadata } from "@/lib/seo";
import { CatalogIndex } from "./CatalogIndex";
export const revalidate = 86400;
export const metadata = pageMetadata("Catálogo de juegos para PC y sus precios | BARATEAM", "Explorá el catálogo de BARATEAM: fichas de juegos, precios y ofertas en Steam, Epic, GOG, Humble y Microsoft Store.", "/juegos");
export default function GamesPage() { return <CatalogIndex />; }
