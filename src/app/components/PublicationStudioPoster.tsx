"use client";

import { REGIONS } from "@/lib/regions";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { chartNumber, studioHasTextSize, studioTextSizes, studioPrices, type StudioDraft, type StudioPlate } from "@/lib/publication-studio";
import { publicationDate, type PublicationGame } from "@/lib/social-publications";
import { FittedText, PublicationPrices } from "./PublicationPoster";

export function PublicationStudioPoster({ draft, plate, games, index }: { draft: StudioDraft; plate: StudioPlate; games: Record<string, PublicationGame>; index: number }) {
  const game = games[draft.gameIds[plate.gameSlot]];
  const region = REGIONS.find(region => region.id === draft.region)!;
  const news = draft.mode === "news";
  const showHeaderDetails = draft.mode === "news" || draft.mode === "story";
  const giveaway = plate.kind === "giveaway-announcement" || plate.kind === "giveaway-winners";
  const image = plate.image || games[plate.coverGameId]?.coverUrl || game?.coverUrl;
  const title = plate.title.trim() || (plate.kind === "game-offer" || plate.kind === "game-feature" ? game?.title ?? "" : "");
  const editableText = studioHasTextSize(plate.kind);
  const editorialCopy = <StudioEditorialCopy plate={plate} title={title} centered={plate.kind === "text" || plate.kind === "cta"} link={plate.kind === "cta" ? news ? "@shuxteam" : "shuxteam.com" : undefined} />;
  const heading = <>{plate.showEyebrow && plate.eyebrow.trim() ? <span className="studioEyebrow" data-publication-text>{plate.eyebrow}</span> : null}{title ? <FittedText as="h2" text={title} max={plate.kind === "cta" ? 96 : 88} min={34} /> : null}</>;
  const paragraph = plate.body.trim() ? <FittedText as="p" text={plate.body} max={giveaway ? 44 : plate.kind === "text" ? 58 : plate.kind === "cta" ? 46 : 36} min={26} /> : null;
  const artwork = <div className="studioArtwork">{image ? <img src={image} alt="" style={{ objectPosition: `${plate.imageX}% ${plate.imageY}%` }} /> : <span>{news ? "SHUX" : game?.title ?? "BARATEAM"}</span>}{news ? <b className="studioWatermark">SHUX</b> : null}</div>;
  const chartValues = plate.rows.map(row => chartNumber(row.value) ?? 0);
  const chartMax = Math.max(1, ...chartValues);
  return <article className={`studioPoster studio-${draft.format} studio-${plate.kind}${news ? " studioNews" : ""}`}>
    <header className="studioHeader"><div><img src="/android-chrome-192x192.png" alt="" /><b>{news ? "SHUX" : "BARATEAM"}</b></div>{showHeaderDetails ? <span>{!news ? <><img src={region.flagSrc} alt="" />{region.label}</> : null}<small>{String(index + 1).padStart(2, "0")} / {String(draft.plates.length).padStart(2, "0")}</small></span> : null}</header>
    {giveaway ? <>
        <div className="studioCopy studioGiveawayHeading">{heading}</div>
        <div className="studioGiveawayContent">
        <div className="studioGiveawayCard">
          <div className="studioGiveawayImage">{image ? <img src={image} alt="" style={{ objectPosition: `${plate.imageX}% ${plate.imageY}%` }} /> : null}</div>
          <FittedText as="h2" text={game?.title ?? "Juego del sorteo"} max={58} min={30} />
        </div>
        {plate.kind === "giveaway-winners" ? <ol className="studioWinners" data-count={plate.winners.length}>{plate.winners.map((name, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><FittedText as="strong" text={name.trim() || `Ganador ${index + 1}`} max={plate.winners.length > 3 ? 42 : 58} min={26} /></li>)}</ol> : null}
        <div className="studioCopy studioGiveawayDescription">{paragraph}</div>
        </div>
        {draft.format === "post" && plate.showMoreInfo && plate.kind === "giveaway-announcement" ? <div className="studioMoreInfo"><ArrowDown size={40} aria-hidden="true" /><span>Más info en la descripción</span></div> : null}
      </> : plate.kind === "cta" || plate.kind === "text" ? editorialCopy
      : plate.kind === "versus-cover" ? <>
        <div className="studioCopy">{heading}</div>
        <div className="studioVersusArtwork">{[0, 1].map((slot) => {
          const selected = games[draft.gameIds[slot]];
          const cover = slot === 0 ? plate.image || games[plate.coverGameId]?.coverUrl || selected?.coverUrl : selected?.coverUrl;
          return <div key={slot} className={`studioVersusHalf half-${slot}`}>
            {cover ? <img src={cover} alt="" style={{ objectPosition: `${slot === 0 ? plate.imageX : plate.secondX}% ${slot === 0 ? plate.imageY : plate.secondY}%` }} /> : null}
          </div>;
        })}<span className="studioVs">VS</span></div>
        <div className="studioVersusNames">{[0, 1].map(slot => <FittedText key={slot} as="strong" text={games[draft.gameIds[slot]]?.title ?? `Juego ${slot + 1}`} max={46} min={25} />)}</div>
        {paragraph ? <div className="studioCopy">{paragraph}</div> : null}
      </> : plate.kind === "versus-prices" ? <>
        <div className="studioCopy">{heading}{paragraph}</div>
        <div className="studioVersusPrices">{[0, 1].map(slot => {
          const selected = games[draft.gameIds[slot]];
          return <section key={slot} className="studioGameComparison">
            <div className="studioComparisonCover">{selected?.coverUrl ? <img src={selected.coverUrl} alt="" style={{ objectPosition: `${slot === 0 ? plate.imageX : plate.secondX}% ${slot === 0 ? plate.imageY : plate.secondY}%` }} /> : null}</div>
            <FittedText as="h2" text={selected?.title ?? `Juego ${slot + 1}`} max={46} min={27} />
            <PublicationPrices prices={studioPrices(selected, plate.stores)} options={plate} compact />
          </section>;
        })}</div>
      </> : plate.kind === "bar-chart" ? <>
        <div className="studioCopy">{heading}{paragraph}</div>
        <div className="studioBars" data-count={plate.rows.length}>{plate.rows.map((row, index) => <div className="studioBarRow" key={row.id}>
          <div className="studioBarLabel">{row.image ? <img src={row.image} alt="" /> : null}<span data-publication-text>{row.label}</span></div>
          <div className="studioBarTrack"><span style={{ width: `${chartValues[index] / chartMax * 100}%` }} /></div>
          {row.showValue ? <div className="studioBarValue"><FittedText as="strong" text={`${chartValues[index].toLocaleString("es-AR")} ${plate.unit}`} max={30} min={18} /></div> : <span />}
        </div>)}</div>
      </> : <>
        {artwork}
        {editableText ? editorialCopy : <div className="studioCopy">{heading}{paragraph}</div>}
        {plate.kind === "game-offer" ? <PublicationPrices prices={studioPrices(game, plate.stores)} options={plate} /> : null}
      </>}
    {draft.format === "story" && plate.reserveLink ? <div className="studioLinkSlot" aria-hidden="true" /> : null}
    <footer className="studioFooter"><div><b>{news ? "@shuxteam" : "shuxteam.com"}</b><span>{news ? "SHUX" : "Una herramienta de Shux"}</span></div><p>{["game-offer", "versus-prices"].includes(plate.kind) ? <>{publicationDate(game?.timestamp ?? games[draft.gameIds[0]]?.timestamp ?? null)}<br />Sin impuestos agregados por BARATEAM.<br />Confirmá el precio final en la tienda.</> : ""}</p></footer>
  </article>;
}

function StudioEditorialCopy({ plate, title, centered, link }: { plate: StudioPlate; title: string; centered: boolean; link?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sizes = studioTextSizes(plate.kind, plate.textSize);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const titleNode = element.querySelector<HTMLElement>("h2");
      const bodyNode = element.querySelector<HTMLElement>("p");
      const apply = (scale: number) => {
        if (titleNode) titleNode.style.fontSize = `${Math.max(24, Math.floor(sizes.title * scale))}px`;
        if (bodyNode) bodyNode.style.fontSize = `${Math.max(16, Math.floor(sizes.body * scale))}px`;
      };
      // Measure the whole copy block, including eyebrow and CTA, against its flex budget.
      const fits = () => {
        const children = [...element.children] as HTMLElement[];
        const style = getComputedStyle(element);
        const needed = children.reduce((height, child) => height + child.offsetHeight, 0)
          + Math.max(0, children.length - 1) * parseFloat(style.rowGap)
          + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        return needed <= element.clientHeight + 1 && children.every(child => child.scrollWidth <= child.clientWidth + 1);
      };
      apply(1);
      if (!fits()) {
        let low = 10;
        let high = 99;
        let best = 10;
        while (low <= high) {
          const percent = Math.floor((low + high) / 2);
          apply(percent / 100);
          if (fits()) { best = percent; low = percent + 1; }
          else high = percent - 1;
        }
        apply(best / 100);
      }
    };
    fit();
    void document.fonts.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); };
  }, [sizes.title, sizes.body, title, plate.body, plate.showEyebrow, plate.eyebrow, link]);
  return <div ref={ref} data-publication-text className={`studioAdaptiveCopy ${centered ? "studioCenteredCopy" : "studioCopy"}`}>
    {plate.showEyebrow && plate.eyebrow.trim() ? <span className="studioEyebrow" data-publication-text>{plate.eyebrow}</span> : null}
    {title ? <h2 data-publication-text style={{ fontSize: sizes.title }}>{title}</h2> : null}
    {plate.body.trim() ? <p data-publication-text style={{ fontSize: sizes.body }}>{plate.body}</p> : null}
    {link ? <strong className="studioCtaLink">{link}</strong> : null}
  </div>;
}
