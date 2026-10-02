import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicationCover, PublicationCta, PublicationPoster } from "../src/app/components/PublicationPoster";
import type { PublicationDraft } from "../src/lib/social-publications";
import { MAX_PUBLICATION_IMAGES, publicationGameLimit } from "../src/lib/social-publications";

const draft: PublicationDraft = { headline: "Dishonored", description: "Para el finde", game: {
  id: "dishonored", title: "Dishonored", coverUrl: "/test.jpg", region: "AR", timestamp: null,
  prices: [{ store: "steam", label: "Steam", amount: 1.47, currency: "USD", discount: 75, historicalLow: true, cheapest: true, stale: false }],
} };
const options = { hideMissing: true, hideStale: true, discounts: true, lows: true, showEyebrow: true, eyebrow: "Elegidos por la comunidad" };

test("poster supports custom or hidden epigraph and adapts to store count", () => {
  const html = renderToStaticMarkup(<PublicationPoster draft={draft} options={options} index={2} total={4} />);
  assert.match(html, /Elegidos por la comunidad/);
  assert.match(html, /data-count="1"/);
  assert.match(html, /font-size:104px/);
  assert.doesNotMatch(renderToStaticMarkup(<PublicationPoster draft={draft} options={{ ...options, showEyebrow: false }} index={1} total={1} />), /Elegidos por la comunidad/);
});

test("cover can reserve blank space and CTA can omit the question", () => {
  const cover = renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" showImages={false} total={3} />);
  assert.doesNotMatch(cover, /test.jpg|JUEGOS ELEGIDOS POR SHUX/);
  assert.match(cover, /01.*03/);
  const cta = renderToStaticMarkup(<PublicationCta drafts={[draft]} question="" total={3} />);
  assert.doesNotMatch(cta, /<h2/);
  assert.match(cta, /notificaciones personalizadas en BARATEAM/);
  assert.match(renderToStaticMarkup(<PublicationCta drafts={[draft]} question="¿Qué vas a jugar?" total={3} />), /¿Qué vas a jugar/);
});

test("cover invitation is editable and optional", () => {
  assert.match(renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" callout="Mirá estas ofertas" />), /Mirá estas ofertas/);
  assert.doesNotMatch(renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" showCallout={false} />), /DESLIZÁ|→/);
});

test("cover subtitle is editable, optional, and defaults to the game count", () => {
  assert.match(renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" />), /1 juegos para tu próxima partida/);
  assert.match(renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" subtitle="Para viciar este finde" />), /Para viciar este finde/);
  assert.doesNotMatch(renderToStaticMarkup(<PublicationCover drafts={[draft]} title="Ofertas" subtitle="Para viciar este finde" showSubtitle={false} />), /Para viciar este finde/);
});

test("carousel allows fifteen images including optional cover and closing", () => {
  assert.equal(MAX_PUBLICATION_IMAGES, 15);
  assert.equal(publicationGameLimit(false, false), 15);
  assert.equal(publicationGameLimit(true, false), 14);
  assert.equal(publicationGameLimit(false, true), 14);
  assert.equal(publicationGameLimit(true, true), 13);
});

test("vertical cover divisions include every selected game without the four-tile cap", () => {
  const drafts = Array.from({ length: 15 }, (_, index) => ({ ...draft, game: { ...draft.game, id: `game-${index}`, coverUrl: `/game-${index}.jpg` } }));
  const strips = renderToStaticMarkup(<PublicationCover drafts={drafts} title="Ofertas" layout="strips" />);
  assert.match(strips, /publicationCoverStrips/);
  assert.match(strips, /repeat\(15, minmax\(0, 1fr\)\)/);
  assert.equal((strips.match(/src="\/game-/g) ?? []).length, 15);
  const tiles = renderToStaticMarkup(<PublicationCover drafts={drafts} title="Ofertas" />);
  assert.equal((tiles.match(/src="\/game-/g) ?? []).length, 4);
});

test("manual stripe crops are independent and safely default to the center", () => {
  const drafts = [{ ...draft, coverPosition: 20 }, { ...draft, game: { ...draft.game, id: "second" }, coverPosition: 80 }, { ...draft, game: { ...draft.game, id: "third" } }];
  const html = renderToStaticMarkup(<PublicationCover drafts={drafts} title="Ofertas" layout="strips" />);
  for (const position of [20, 80, 50]) assert.match(html, new RegExp(`object-position:${position}% center`));
  assert.match(renderToStaticMarkup(<PublicationCover drafts={[{ ...draft, coverPosition: 200 }]} title="Ofertas" layout="strips" />), /object-position:100% center/);
});

test("CTA uses distinct catalog covers and makes the question the primary message", () => {
  const backgroundGames = Array.from({ length: 24 }, (_, index) => ({ id: `game-${index}`, title: `Game ${index}`, coverUrl: `/cover-${index}.jpg` }));
  const html = renderToStaticMarkup(<PublicationCta drafts={[draft]} question="¿Cuál elegís?" total={3} backgroundGames={backgroundGames} />);
  assert.equal((html.match(/src="\/cover-/g) ?? []).length, 24);
  assert.equal((html.match(/<b>BARATEAM<\/b>/g) ?? []).length, 1);
  assert.match(html, /BARATEAM 🤙/);
});
