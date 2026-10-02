"use client";

import { useEffect, useRef } from "react";
import { REGIONS } from "@/lib/regions";
import { STORE_LOGOS } from "@/lib/store-assets";
import { publicationDate, publicationMoney, type PublicationDraft } from "@/lib/social-publications";

export type PosterOptions = { hideMissing: boolean; hideStale: boolean; discounts: boolean; lows: boolean; showEyebrow: boolean; eyebrow: string };
export type PublicationBackgroundGame = { id: string; title: string; coverUrl: string };

export function PublicationPoster({ draft, options, index, total }: { draft: PublicationDraft; options: PosterOptions; index: number; total: number }) {
  const { game } = draft;
  const prices = game.prices.filter(price => (!options.hideMissing || price.amount != null) && (!options.hideStale || !price.stale));
  const title = draft.headline.trim() || game.title;
  return <article className="publicationPoster publicationGame">
    <PosterHeader draft={draft} index={index} total={total} />
    <div className="publicationArtwork">
      {game.coverUrl ? <img src={game.coverUrl} alt="" /> : <span>{game.title}</span>}
    </div>
    <div className="publicationCopy">
      {options.showEyebrow && options.eyebrow.trim() ? <span className="publicationEyebrow">{options.eyebrow}</span> : null}
      <FittedText as="h2" text={title} max={72} min={30} />
      {draft.description.trim() ? <FittedText as="p" text={draft.description} max={29} min={20} /> : null}
    </div>
    <div className="publicationPricesArea"><div className="publicationPriceGrid" data-count={prices.length} style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(prices.length / 2))}, minmax(0, 1fr))` }}>
      {prices.map((price, index) => <div key={price.store} className={`publicationPrice ${price.cheapest ? "best" : ""} ${prices.length % 2 && index === prices.length - 1 ? "wide" : ""}`}>
        <div className="publicationStore"><img src={STORE_LOGOS[price.store]} alt="" /><span>{price.label}</span>
          {options.discounts && price.discount > 0 ? <b className="publicationDiscount">-{price.discount}%</b> : null}
        </div>
        <FittedText as="strong" text={publicationMoney(price)} max={prices.length === 1 ? 104 : prices.length === 2 ? 76 : prices.length <= 4 ? 48 : 34} min={24} />
        <div className="publicationMarkers">
          {price.cheapest ? <span>MÁS BARATO</span> : null}
          {options.lows && price.historicalLow ? <span className="publicationLow">MÍNIMO HISTÓRICO REGISTRADO</span> : null}
        </div>
      </div>)}
    </div></div>
    <PosterFooter date={publicationDate(game.timestamp)} />
  </article>;
}

export function PublicationCover({ drafts, title, subtitle, showSubtitle = true, showImages = true, layout = "tiles", showCallout = true, callout = "DESLIZÁ Y COMPARÁ PRECIOS", total = drafts.length + 1 }: { drafts: PublicationDraft[]; title: string; subtitle?: string; showSubtitle?: boolean; showImages?: boolean; layout?: "tiles" | "strips"; showCallout?: boolean; callout?: string; total?: number }) {
  return <article className="publicationPoster publicationCover">
    <PosterHeader draft={drafts[0]} index={1} total={total} />
    <div className="publicationCoverCopy">
      <FittedText as="h2" text={title || "Ofertas para viciar"} max={112} min={40} />
      {showSubtitle && (subtitle ?? `${drafts.length} juegos para tu próxima partida.`).trim() ? <FittedText as="p" text={subtitle ?? `${drafts.length} juegos para tu próxima partida.`} max={30} min={20} /> : null}
    </div>
    <div className={`publicationCoverImages ${layout === "strips" ? "publicationCoverStrips" : ""}`} style={layout === "strips" ? { gridTemplateColumns: `repeat(${Math.max(1, drafts.length)}, minmax(0, 1fr))` } : undefined}>{showImages ? (layout === "strips" ? drafts : drafts.slice(0, 4)).map(({ game, coverPosition }) => <div key={game.id}>
      {game.coverUrl ? <img src={game.coverUrl} alt={layout === "strips" ? game.title : ""} style={layout === "strips" ? { objectPosition: `${Math.max(0, Math.min(100, Number.isFinite(coverPosition) ? coverPosition! : 50))}% center` } : undefined} /> : <span>{game.title}</span>}{layout === "tiles" ? <strong>{game.title}</strong> : null}
    </div>) : null}</div>
    <div className="publicationCoverCallout">{showCallout && callout.trim() ? <><FittedText as="strong" text={callout} max={32} min={20} /><span>→</span></> : null}</div>
    <PosterFooter date={publicationDate(drafts[0].game.timestamp)} />
  </article>;
}

export function PublicationCta({ drafts, question, total, backgroundGames = [] }: { drafts: PublicationDraft[]; question: string; total: number; backgroundGames?: PublicationBackgroundGame[] }) {
  return <article className="publicationPoster publicationCta">
    <div className="publicationCtaBackground">{backgroundGames.map(game =>
      <div key={game.id}><img src={game.coverUrl} alt="" /><strong>{game.title}</strong></div>
    )}</div>
    <PosterHeader draft={drafts[0]} index={total} total={total} />
    <div className="publicationCtaCopy" data-question={Boolean(question.trim())}>
      {question.trim() ? <FittedText as="h2" text={question} max={72} min={36} /> : null}
      <FittedText as="p" text="Compará precios en distintas tiendas y países, consultá históricos y creá tu wishlist con notificaciones personalizadas en BARATEAM 🤙" max={36} min={28} />
      <span>shuxteam.com</span>
    </div>
    <footer className="publicationCtaFooter">Una herramienta de Shux</footer>
  </article>;
}

function FittedText({ as: Tag, text, max, min }: { as: "h2" | "p" | "strong"; text: string; max: number; min: number }) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  useEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled || !ref.current) return;
      const element = ref.current;
      let size = max;
      element.style.fontSize = `${size}px`;
      const heightLimit = parseFloat(getComputedStyle(element).maxHeight);
      while (size > min && ((Number.isFinite(heightLimit) && element.scrollHeight > heightLimit + 1) || element.scrollWidth > element.clientWidth + 1)) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
    };
    fit();
    void document.fonts.ready.then(fit);
    return () => { cancelled = true; };
  }, [text, max, min]);
  return <Tag ref={ref} style={{ fontSize: max }}>{text}</Tag>;
}

function PosterHeader({ draft, index, total }: { draft: PublicationDraft; index: number; total: number }) {
  const region = REGIONS.find(region => region.id === draft.game.region)!;
  return <header className="publicationPosterHeader"><div><img src="/android-chrome-192x192.png" alt="" /><b>BARATEAM</b></div>
    <span><img src={region.flagSrc} alt="" />{region.label}<small>{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</small></span>
  </header>;
}

function PosterFooter({ date }: { date: string }) {
  return <footer className="publicationPosterFooter"><div><b>shuxteam.com</b><span>Una herramienta de Shux</span></div>
    <p>{date}<br />Sin impuestos agregados por BARATEAM.<br />Confirmá el precio final en la tienda.</p></footer>;
}
