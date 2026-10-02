"use client";

import { useEffect, useRef } from "react";
import { REGIONS } from "@/lib/regions";
import { STORE_LOGOS } from "@/lib/store-assets";
import { publicationDate, publicationMoney, type PublicationDraft } from "@/lib/social-publications";

export type PosterOptions = { hideMissing: boolean; hideStale: boolean; discounts: boolean; lows: boolean };

export function PublicationPoster({ draft, options, index, total }: { draft: PublicationDraft; options: PosterOptions; index: number; total: number }) {
  const { game } = draft;
  const prices = game.prices.filter(price => (!options.hideMissing || price.amount != null) && (!options.hideStale || !price.stale));
  const title = draft.headline.trim() || game.title;
  return <article className="publicationPoster">
    <PosterHeader draft={draft} index={index} total={total} />
    <div className="publicationArtwork">
      {game.coverUrl ? <img src={game.coverUrl} alt="" /> : <span>{game.title}</span>}
    </div>
    <div className="publicationCopy">
      <span className="publicationEyebrow">LA SELECCIÓN DE SHUX</span>
      <FittedText as="h2" text={title} max={72} min={30} />
      <FittedText as="p" text={draft.description} max={29} min={20} />
    </div>
    <div className="publicationPriceGrid" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(prices.length / 2))}, minmax(0, 1fr))` }}>
      {prices.map((price, index) => <div key={price.store} className={`publicationPrice ${price.cheapest ? "best" : ""} ${prices.length % 2 && index === prices.length - 1 ? "wide" : ""}`}>
        <div className="publicationStore"><img src={STORE_LOGOS[price.store]} alt="" /><span>{price.label}</span>
          {options.discounts && price.discount > 0 ? <b className="publicationDiscount">-{price.discount}%</b> : null}
        </div>
        <strong>{publicationMoney(price)}</strong>
        <div className="publicationMarkers">
          {price.cheapest ? <span>MÁS BARATO</span> : null}
          {options.lows && price.historicalLow ? <span className="publicationLow">MÍNIMO HISTÓRICO REGISTRADO</span> : null}
        </div>
      </div>)}
    </div>
    <PosterFooter date={publicationDate(game.timestamp)} />
  </article>;
}

export function PublicationCover({ drafts, title }: { drafts: PublicationDraft[]; title: string }) {
  return <article className="publicationPoster publicationCover">
    <PosterHeader draft={drafts[0]} index={1} total={drafts.length + 1} />
    <div className="publicationCoverCopy"><span className="publicationEyebrow">JUEGOS ELEGIDOS POR SHUX</span>
      <FittedText as="h2" text={title || "Ofertas para viciar"} max={94} min={40} />
      <p>{drafts.length} juegos para tu próxima partida.</p>
    </div>
    <div className="publicationCoverImages">{drafts.slice(0, 4).map(({ game }) => <div key={game.id}>
      {game.coverUrl ? <img src={game.coverUrl} alt="" /> : null}<strong>{game.title}</strong>
    </div>)}</div>
    <div className="publicationCoverCallout">DESLIZÁ Y COMPARÁ PRECIOS <span>→</span></div>
    <PosterFooter date={publicationDate(drafts[0].game.timestamp)} />
  </article>;
}

function FittedText({ as: Tag, text, max, min }: { as: "h2" | "p"; text: string; max: number; min: number }) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  useEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled || !ref.current) return;
      const element = ref.current;
      let size = max;
      element.style.fontSize = `${size}px`;
      while (size > min && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
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
