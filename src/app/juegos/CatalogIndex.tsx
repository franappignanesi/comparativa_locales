import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameSample } from "@/lib/sample-builder";

export const INDEX_PAGE_SIZE = 100;
export async function CatalogIndex({ page = 1 }: { page?: number }) {
  const sample = await getGameSample();
  const games = [...sample.broadSample].sort((a, b) => a.title.localeCompare(b.title, "es"));
  const pages = Math.ceil(games.length / INDEX_PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || page > pages) notFound();
  const pageUrl = (number: number) => number === 1 ? "/juegos" : `/juegos/pagina/${number}`;
  return <main className="seoPage"><nav className="seoNav"><Link href="/">BARATEAM</Link><Link href="/biblioteca">Biblioteca</Link></nav>
    <h1>Catálogo de juegos para PC{page > 1 ? `: página ${page}` : ""}</h1><p>Buscá entre {games.length} juegos y compará sus precios en tiendas oficiales. Para filtrar por ofertas, género y tienda, visitá la <Link href="/biblioteca">biblioteca</Link>.</p>
    <ul className="seoGameList">{games.slice((page - 1) * INDEX_PAGE_SIZE, page * INDEX_PAGE_SIZE).map((game) => <li key={game.id}><Link prefetch={false} href={`/juegos/${game.id}`}>{game.title}</Link></li>)}</ul>
    <nav className="seoPagination" aria-label="Páginas del catálogo">{page > 1 ? <Link href={pageUrl(page - 1)}>Anterior</Link> : null}<span>Página {page} de {pages}</span>{page < pages ? <Link href={pageUrl(page + 1)}>Siguiente</Link> : null}</nav>
  </main>;
}
