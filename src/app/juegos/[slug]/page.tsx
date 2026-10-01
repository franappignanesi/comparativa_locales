import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameSeoData, gameStructuredData } from "@/lib/game-seo";
import { pageMetadata, serializeJsonLd, SITE_URL, STORE_NAMES } from "@/lib/seo";
import { formatGameCategory } from "@/lib/categories";
import { WeekendRecommendation } from "@/app/components/WeekendRecommendation";

export const revalidate = 86400;
export function generateStaticParams() { return []; }
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getGameSeoData((await params).slug);
  if (!data) return { title: "Juego no encontrado | BARATEAM", robots: { index: false } };
  const metadata = pageMetadata(`${data.game.title}: precios y ofertas para PC | BARATEAM`, `Compará el precio de ${data.game.title} para PC en tiendas oficiales. Consultá ofertas, precios en Argentina y el historial en BARATEAM, de Shux.`, `/juegos/${data.game.id}`, data.game.coverUrl ?? undefined);
  return data.offers.length || data.weekend || data.game.isFree ? metadata : { ...metadata, robots: { index: false, follow: true } };
}
export default async function GamePage({ params }: Props) {
  const data = await getGameSeoData((await params).slug);
  if (!data) notFound();
  const { game, offers, related } = data;
  const breadcrumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Juegos", item: `${SITE_URL}/juegos` },
    { "@type": "ListItem", position: 3, name: game.title, item: `${SITE_URL}/juegos/${game.id}` } ] };
  return <main className="seoPage">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(gameStructuredData(data)) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }} />
    <nav className="seoNav" aria-label="Navegación"><Link href="/">BARATEAM</Link><Link href="/biblioteca">Biblioteca</Link><Link href="/juegos">Todos los juegos</Link></nav>
    <nav className="seoBreadcrumb" aria-label="Ruta"><Link href="/">Inicio</Link> / <Link href="/juegos">Juegos</Link> / <span>{game.title}</span></nav>
    <header className="seoGameHeader">
      {game.coverUrl ? <img src={game.coverUrl} alt={game.title} width={460} height={215} fetchPriority="high" /> : null}
      <div><h1>{game.title}: precios para PC</h1><p>{game.releaseYear > 0 ? `${game.releaseYear} · ` : ""}{formatGameCategory(game.primaryTag ?? game.category)}</p><p>Compará precios en Argentina entre tiendas oficiales. Cada tienda muestra su moneda de venta; los importes siguientes no incluyen impuestos ni cargos del medio de pago.</p></div>
    </header>
    <section aria-labelledby="game-prices"><h2 id="game-prices">Precios y ofertas de {game.title}</h2>
      {offers.length ? <div className="seoTableScroll"><table className="seoPriceTable"><thead><tr><th scope="col">Tienda</th><th scope="col">Precio sin impuestos</th><th scope="col">Descuento</th><th scope="col">Compra</th></tr></thead><tbody>{offers.map(({ store, price }) => <tr key={store}><th scope="row">{STORE_NAMES[store]}</th><td>{price.currency} {new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price.finalPrice!)}{price.isStale ? <small>Último precio conocido</small> : null}</td><td>{price.discountPct ? `${price.discountPct}%` : "—"}</td><td><a href={price.url!} target="_blank" rel="noopener noreferrer">Ver tienda</a></td></tr>)}</tbody></table></div> : <p>{game.isFree ? "Este juego es gratuito. Consultá su disponibilidad en Steam." : "Todavía no tenemos un precio disponible para este juego. Podés consultar su ficha en la biblioteca."}</p>}
      {data.timestamp ? <p className="seoUpdated">Datos publicados: <time dateTime={data.timestamp}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(data.timestamp))}</time>. Los precios pueden cambiar; confirmalos en la tienda antes de comprar.</p> : null}
      <Link className="seoPrimaryLink" href={`/biblioteca?query=${encodeURIComponent(game.title)}&game=${game.id}`}>Ver historial, mínimos y lista de deseados</Link>
    </section>
    {data.weekend ? <WeekendRecommendation game={data.weekend} gameId={game.id} /> : null}
    {related.length ? <section><h2>Más juegos para comparar</h2><ul className="seoGameList">{related.map((item) => <li key={item.id}><Link prefetch={false} href={`/juegos/${item.id}`}>{item.title}</Link></li>)}</ul></section> : null}
    <footer className="seoFooter">© 2026 BARATEAM. Creado por Shux. Consultas: shuxteam@gmail.com o @shuxteam en Instagram.</footer>
  </main>;
}
