"use client";

import { REGIONS } from "@/lib/regions";
import { chartNumber, studioPrices, type StudioDraft, type StudioPlate } from "@/lib/publication-studio";
import { publicationDate, type PublicationGame } from "@/lib/social-publications";
import { FittedText, PublicationPrices } from "./PublicationPoster";

export function PublicationStudioPoster({ draft, plate, games, index }: { draft: StudioDraft; plate: StudioPlate; games: Record<string, PublicationGame>; index: number }) {
  const game = games[draft.gameIds[plate.gameSlot]];
  const region = REGIONS.find(region => region.id === draft.region)!;
  const news = draft.mode === "news";
  const image = plate.image || games[plate.coverGameId]?.coverUrl || game?.coverUrl;
  const title = plate.title.trim() || (plate.kind === "game-offer" || plate.kind === "game-feature" ? game?.title ?? "" : "");
  const heading = <>{plate.showEyebrow && plate.eyebrow.trim() ? <span className="studioEyebrow" data-publication-text>{plate.eyebrow}</span> : null}{title ? <FittedText as="h2" text={title} max={plate.kind === "cta" ? 96 : 88} min={34} /> : null}</>;
  const paragraph = plate.body.trim() ? <FittedText as="p" text={plate.body} max={plate.kind === "text" ? 58 : plate.kind === "cta" ? 46 : 36} min={26} /> : null;
  const artwork = <div className="studioArtwork">{image ? <img src={image} alt="" style={{ objectPosition: `${plate.imageX}% ${plate.imageY}%` }} /> : <span>{news ? "SHUX" : game?.title ?? "BARATEAM"}</span>}{news ? <b className="studioWatermark">SHUX</b> : null}</div>;
  const chartValues = plate.rows.map(row => chartNumber(row.value) ?? 0);
  const chartMax = Math.max(1, ...chartValues);
  return <article className={`studioPoster studio-${draft.format} studio-${plate.kind}${news ? " studioNews" : ""}`}>
    <header className="studioHeader"><div><img src="/android-chrome-192x192.png" alt="" /><b>{news ? "SHUX" : "BARATEAM"}</b></div><span>{!news ? <><img src={region.flagSrc} alt="" />{region.label}</> : null}<small>{String(index + 1).padStart(2, "0")} / {String(draft.plates.length).padStart(2, "0")}</small></span></header>
    {plate.kind === "cta" || plate.kind === "text" ? <div className="studioCenteredCopy">{heading}{paragraph}{plate.kind === "cta" ? <strong className="studioCtaLink">{news ? "@shuxteam" : "shuxteam.com"}</strong> : null}</div>
      : plate.kind === "versus-cover" ? <>
        <div className="studioCopy">{heading}</div>
        <div className="studioVersusArtwork">{[0, 1].map((slot) => {
          const selected = games[draft.gameIds[slot]];
          return <div key={slot} className={`studioVersusHalf half-${slot}`}>
            {slot === 0 && plate.image || selected?.coverUrl ? <img src={slot === 0 && plate.image ? plate.image : selected!.coverUrl!} alt="" style={{ objectPosition: `${slot === 0 ? plate.imageX : plate.secondX}% ${slot === 0 ? plate.imageY : plate.secondY}%` }} /> : null}
          </div>;
        })}<span className="studioVs">VS</span></div>
        <div className="studioVersusNames">{[0, 1].map(slot => <FittedText key={slot} as="strong" text={games[draft.gameIds[slot]]?.title ?? `Juego ${slot + 1}`} max={46} min={25} />)}</div>
        {paragraph ? <div className="studioCopy">{paragraph}</div> : null}
      </> : plate.kind === "versus-prices" ? <>
        <div className="studioCopy">{heading}{paragraph}</div>
        <div className="studioVersusPrices">{[0, 1].map(slot => {
          const selected = games[draft.gameIds[slot]];
          return <section key={slot} className="studioGameComparison">
            <div className="studioComparisonCover">{selected?.coverUrl ? <img src={selected.coverUrl} alt="" /> : null}</div>
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
        <div className="studioCopy">{heading}{paragraph}</div>
        {plate.kind === "game-offer" ? <PublicationPrices prices={studioPrices(game, plate.stores)} options={plate} /> : null}
      </>}
    {draft.format === "story" && plate.reserveLink ? <div className="studioLinkSlot" aria-hidden="true" /> : null}
    <footer className="studioFooter"><div><b>{news ? "@shuxteam" : "shuxteam.com"}</b><span>{news ? "SHUX" : "Una herramienta de Shux"}</span></div><p>{["game-offer", "versus-prices"].includes(plate.kind) ? <>{publicationDate(game?.timestamp ?? games[draft.gameIds[0]]?.timestamp ?? null)}<br />Sin impuestos agregados por BARATEAM.<br />Confirmá el precio final en la tienda.</> : ""}</p></footer>
  </article>;
}
