import { notFound, permanentRedirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { CatalogIndex } from "../../CatalogIndex";
export const revalidate = 86400;
export function generateStaticParams() { return []; }
type Props = { params: Promise<{ page: string }> };
export async function generateMetadata({ params }: Props) {
  const value = (await params).page;
  return pageMetadata(`Catálogo de juegos: página ${value} | BARATEAM`, `Juegos para PC del catálogo de BARATEAM, página ${value}. Compará sus precios y ofertas entre tiendas oficiales.`, `/juegos/pagina/${value}`);
}
export default async function GamesIndexPage({ params }: Props) {
  const value = (await params).page;
  const page = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(page)) notFound();
  if (page === 1) permanentRedirect("/juegos");
  if (String(page) !== value) permanentRedirect(`/juegos/pagina/${page}`);
  return <CatalogIndex page={page} />;
}
