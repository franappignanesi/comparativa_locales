"use client";

import { ArrowDown, ArrowUp, Copy, Download, ImagePlus, LoaderCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/regions";
import { MAX_PUBLICATION_IMAGES, publicationGameLimit, publicationCaption, type PublicationDraft, type PublicationGame } from "@/lib/social-publications";
import { PublicationCover, PublicationCta, PublicationPoster, type PosterOptions, type PublicationBackgroundGame } from "./PublicationPoster";
import styles from "./publications.module.css";

type SearchGame = { id: string; title: string };
const DRAFT_KEY = "barateam-publications-v1";

export function AdminPublications({ initialRegion }: { initialRegion: RegionId }) {
  const [region, setRegion] = useState(initialRegion);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchGame[]>([]);
  const [searching, setSearching] = useState(true);
  const [drafts, setDrafts] = useState<PublicationDraft[]>([]);
  const [active, setActive] = useState("");
  const [coverTitle, setCoverTitle] = useState("Ofertas para viciar");
  const [coverSubtitle, setCoverSubtitle] = useState<string | null>(null);
  const [showCoverSubtitle, setShowCoverSubtitle] = useState(true);
  const [includeCover, setIncludeCover] = useState(false);
  const [coverImages, setCoverImages] = useState(true);
  const [coverLayout, setCoverLayout] = useState<"tiles" | "strips">("tiles");
  const [showCallout, setShowCallout] = useState(true);
  const [coverCallout, setCoverCallout] = useState("DESLIZÁ Y COMPARÁ PRECIOS");
  const [backgroundGames, setBackgroundGames] = useState<PublicationBackgroundGame[]>([]);
  const [includeCta, setIncludeCta] = useState(true);
  const [ctaQuestion, setCtaQuestion] = useState("");
  const [preview, setPreview] = useState<"game" | "cover" | "cta">("game");
  const [options, setOptions] = useState<PosterOptions>({ hideMissing: true, hideStale: true, discounts: true, lows: true, showEyebrow: true, eyebrow: "LA SELECCIÓN DE SHUX" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [width, setWidth] = useState(400);
  const viewport = useRef<HTMLDivElement>(null);
  const exports = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const selected = drafts.find(draft => draft.game.id === active) ?? drafts[0];
  const hasStale = drafts.some(draft => draft.game.prices.some(price => price.amount != null && price.stale));
  const stale = hasStale && !options.hideStale;
  const outputDrafts = drafts.map(draft => ({ ...draft, game: { ...draft.game, prices: draft.game.prices.filter(price => !price.stale) } }));
  const missingPrices = outputDrafts.some(draft => !draft.game.prices.some(price => price.amount != null));
  const total = drafts.length ? drafts.length + Number(includeCover) + Number(includeCta) : 0;
  const maxGames = publicationGameLimit(includeCover, includeCta);
  const caption = publicationCaption(outputDrafts, coverTitle) + (includeCta && ctaQuestion.trim() ? `\n\n${ctaQuestion.trim()}` : "");

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const text = localStorage.getItem(DRAFT_KEY);
        if (!text || text.length > 50000) return;
        const saved = JSON.parse(text);
        if (saved.version !== 1 || !REGIONS.some(region => region.id === saved.region) || !Array.isArray(saved.items)) return;
        setBusy("Restaurando borrador...");
        const items: PublicationDraft[] = [];
        for (const item of saved.items.slice(0, publicationGameLimit(saved.includeCover === true, saved.includeCta !== false))) {
          if (cancelled) return;
          if (typeof item?.id !== "string" || item.id.length > 200 || items.some(draft => draft.game.id === item.id)) continue;
          const game = await loadGame(item.id, saved.region);
          items.push({ game, headline: typeof item.headline === "string" ? item.headline.slice(0, 90) : game.title,
            description: typeof item.description === "string" ? item.description.slice(0, 170) : "",
            coverPosition: typeof item.coverPosition === "number" && Number.isFinite(item.coverPosition) ? Math.max(0, Math.min(100, item.coverPosition)) : 50 });
        }
        if (cancelled) return;
        setDrafts(items); setRegion(saved.region); setActive(items[0]?.game.id ?? "");
        setIncludeCover(saved.includeCover === true);
        setShowCoverSubtitle(saved.showCoverSubtitle !== false);
        if (typeof saved.coverSubtitle === "string") setCoverSubtitle(saved.coverSubtitle.slice(0, 120));
        setCoverImages(saved.coverImages !== false);
        setCoverLayout(saved.coverLayout === "strips" ? "strips" : "tiles");
        setShowCallout(saved.showCallout !== false);
        if (typeof saved.coverCallout === "string") setCoverCallout(saved.coverCallout.slice(0, 80));
        setIncludeCta(saved.includeCta !== false);
        if (typeof saved.ctaQuestion === "string") setCtaQuestion(saved.ctaQuestion.slice(0, 120));
        if (saved.options && typeof saved.options === "object") setOptions(current => ({
          ...current,
          ...Object.fromEntries(["hideMissing", "hideStale", "discounts", "lows", "showEyebrow"].filter(key => typeof saved.options[key] === "boolean").map(key => [key, saved.options[key]])),
          eyebrow: typeof saved.options.eyebrow === "string" ? saved.options.eyebrow.slice(0, 60) : current.eyebrow,
        }));
        if (typeof saved.coverTitle === "string") setCoverTitle(saved.coverTitle.slice(0, 72));
      } catch { if (!cancelled) setError("No pudimos restaurar el borrador. Podés volver a elegir los juegos."); }
      finally { if (!cancelled) { restored.current = true; setBusy(""); } }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    // Store only editorial choices; prices are always reloaded from the protected API.
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, region, includeCover, coverTitle, coverSubtitle, showCoverSubtitle, coverImages, coverLayout, showCallout, coverCallout, includeCta, ctaQuestion, options,
      items: drafts.map(draft => ({ id: draft.game.id, headline: draft.headline, description: draft.description, coverPosition: draft.coverPosition })) })); }
    catch { /* Storage may be unavailable in private browsing. */ }
  }, [drafts, region, includeCover, coverTitle, coverSubtitle, showCoverSubtitle, coverImages, coverLayout, showCallout, coverCallout, includeCta, ctaQuestion, options]);

  useEffect(() => {
    if (!includeCta) return;
    const controller = new AbortController();
    void fetch("/api/admin/publications?background=1", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("No pudimos cargar el fondo de biblioteca. Reabrí Publicaciones para reintentar.");
      const payload = await response.json();
      if (!controller.signal.aborted) setBackgroundGames(payload.games);
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [includeCta]);

  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/publications?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Iniciá sesión con una cuenta administradora." : "No pudimos buscar juegos.");
        const payload = await response.json();
        setResults(payload.games ?? []);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No pudimos buscar juegos.");
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [Boolean(selected)]);

  async function loadGame(id: string, targetRegion: RegionId): Promise<PublicationGame> {
    const response = await fetch(`/api/admin/publications?gameId=${encodeURIComponent(id)}&region=${targetRegion}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Tu sesión admin venció. Volvé a iniciar sesión." : "No pudimos cargar los precios del juego.");
    return (await response.json()).game;
  }

  async function addGame(game: SearchGame) {
    if (busy || drafts.length >= maxGames || drafts.some(draft => draft.game.id === game.id)) return;
    setBusy("Cargando juego..."); setError(""); setMessage("");
    try {
      const data = await loadGame(game.id, region);
      setDrafts(current => [...current, { game: data, headline: data.title, description: "" }]);
      setActive(data.id); setPreview("game");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }

  async function refresh(targetRegion = region) {
    if (busy) return;
    setBusy("Consultando precios..."); setError("");
    try {
      const updated: PublicationDraft[] = [];
      // Bound the workload: one cached game/history read at a time, never a price refresh.
      for (const draft of drafts) updated.push({ ...draft, game: await loadGame(draft.game.id, targetRegion) });
      setDrafts(updated); setRegion(targetRegion);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }

  function edit(updates: Partial<Pick<PublicationDraft, "headline" | "description" | "coverPosition">>) {
    setDrafts(current => current.map(draft => draft.game.id === selected?.game.id ? { ...draft, ...updates } : draft));
  }

  function move(index: number, direction: number) {
    setDrafts(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  async function download(all: boolean) {
    if (busy || !selected || stale || missingPrices) return;
    if (total > MAX_PUBLICATION_IMAGES) { setError("El carrusel admite hasta 15 imágenes, incluyendo portada y cierre."); return; }
    if (includeCta && (all || preview === "cta") && !backgroundGames.length) {
      setError("El fondo de biblioteca todavía no está disponible. Esperá o desactivá el cierre."); return;
    }
    setError(""); setMessage(""); setBusy("Preparando imágenes...");
    try {
      await document.fonts.ready;
      const { toBlob, getFontEmbedCSS } = await import("html-to-image");
      const nodes = Array.from(exports.current!.querySelectorAll<HTMLElement>("[data-publication-export]"));
      const chosen = all ? nodes : nodes.filter(node => node.dataset.publicationExport === (preview === "cover" && includeCover ? "cover" : preview === "cta" && includeCta ? "cta" : `game-${selected.game.id}`));
      const images: Array<{ name: string; blob: Blob }> = [];
      let fontEmbedCSS: string | undefined;
      for (const [index, wrapper] of chosen.entries()) {
        setBusy(`Generando ${index + 1}/${chosen.length}...`);
        const node = wrapper.firstElementChild as HTMLElement;
        await Promise.all(Array.from(node.querySelectorAll("img")).map(async image => {
          await image.decode();
          if (!image.naturalWidth) throw new Error("Falta una imagen. Reintentá antes de descargar.");
        }));
        if (Array.from(node.querySelectorAll<HTMLElement>("h2, .publicationCopy p, .publicationCtaCopy p, .publicationEyebrow, .publicationStore, .publicationMarkers, .publicationPrice, .publicationPrice strong")).some(element => element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2)) {
          throw new Error("Un texto no entra en la imagen. Acortá el título o la descripción.");
        }
        fontEmbedCSS ??= await getFontEmbedCSS(node);
        const blob = await toBlob(node, { width: 1080, height: 1350, pixelRatio: 1, includeQueryParams: true, fontEmbedCSS, backgroundColor: "#111111", style: { transform: "none", margin: "0" } });
        if (!blob) throw new Error("No pudimos generar la imagen.");
        images.push({ name: `${String(nodes.indexOf(wrapper) + 1).padStart(2, "0")}-${safeName(wrapper.dataset.publicationExport!)}.png`, blob });
      }
      if (all) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        images.forEach(image => zip.file(image.name, image.blob));
        zip.file("texto-publicacion.txt", caption);
        saveBlob(await zip.generateAsync({ type: "blob" }), `barateam-${region.toLowerCase()}-carrusel.zip`);
      } else if (images[0]) saveBlob(images[0].blob, images[0].name);
      setMessage(all ? "Carrusel descargado." : "Imagen descargada.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); setMessage("Texto copiado."); }
    catch { setError("No pudimos copiar el texto. Podés seleccionarlo debajo."); }
  }

  return <section className={styles.generator} aria-label="Generador de publicaciones">
    <div className={styles.toolbar}><h2>Publicaciones</h2><div>
      <select aria-label="País de la publicación" value={region} disabled={Boolean(busy)} onChange={event => void refresh(event.target.value as RegionId)}>
        {REGIONS.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}
      </select>
      <button title="Volver a consultar precios guardados" aria-label="Volver a consultar precios guardados" disabled={Boolean(busy) || !drafts.length} onClick={() => void refresh()}><RefreshCw size={17} /></button>
    </div></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {stale ? <p className={styles.error} role="alert">Hay precios sin actualizar en las últimas 48 horas. Actualizá los datos del catálogo antes de exportar.</p> : null}
    {hasStale && options.hideStale ? <p className={styles.status}>Las tiendas con precios desactualizados quedan excluidas.</p> : null}
    {missingPrices ? <p className={styles.error} role="alert">Uno de los juegos no tiene precios disponibles. Quitalo o elegí otro país antes de exportar.</p> : null}
    <div className={styles.workspace}>
      <div className={styles.editor}>
        <label className={styles.search}><Search size={17} /><input aria-label="Buscar juego para publicación" placeholder="Buscar juego..." value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /></label>
        <div className={styles.results} aria-busy={searching}>
          {searching ? <span className={styles.status}><LoaderCircle size={16} />Buscando...</span> : results.length ? results.map(game =>
            <button key={game.id} disabled={Boolean(busy) || drafts.length >= maxGames || drafts.some(draft => draft.game.id === game.id)} onClick={() => void addGame(game)} title={`Agregar ${game.title}`}>
              <span>{game.title}</span><Plus size={16} />
            </button>) : <p>No encontramos juegos.</p>}
        </div>
        <h3>Carrusel <span>{total}/{MAX_PUBLICATION_IMAGES} imágenes</span></h3>
        <ol className={styles.queue}>{drafts.map((draft, index) => <li key={draft.game.id}>
          <button className={draft.game.id === selected?.game.id && preview === "game" ? styles.current : ""} disabled={Boolean(busy)} onClick={() => { setActive(draft.game.id); setPreview("game"); }}><span>{index + 1}. {draft.game.title}</span></button>
          <button disabled={Boolean(busy) || index === 0} title="Mover arriba" aria-label={`Mover ${draft.game.title} arriba`} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
          <button disabled={Boolean(busy) || index === drafts.length - 1} title="Mover abajo" aria-label={`Mover ${draft.game.title} abajo`} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
          <button disabled={Boolean(busy)} title="Quitar juego" aria-label={`Quitar ${draft.game.title}`} onClick={() => setDrafts(current => current.filter(item => item.game.id !== draft.game.id))}><Trash2 size={15} /></button>
        </li>)}</ol>
        <fieldset disabled={Boolean(busy)} className={styles.settings}>
          <legend>Portada</legend>
          <label><input type="checkbox" checked={includeCover} disabled={!includeCover && total >= MAX_PUBLICATION_IMAGES} onChange={event => { setIncludeCover(event.target.checked); if (!event.target.checked && preview === "cover") setPreview("game"); }} />Incluir portada</label>
          {includeCover ? <><label>Título de portada<input maxLength={72} value={coverTitle} onChange={event => setCoverTitle(event.target.value)} /></label>
            <label><input type="checkbox" checked={showCoverSubtitle} onChange={event => setShowCoverSubtitle(event.target.checked)} />Mostrar epígrafe de portada</label>
            {showCoverSubtitle ? <label>Epígrafe de portada<input maxLength={120} value={coverSubtitle ?? `${drafts.length} juegos para tu próxima partida.`} onChange={event => setCoverSubtitle(event.target.value)} /></label> : null}
            <label><input type="checkbox" checked={coverImages} onChange={event => setCoverImages(event.target.checked)} />Mostrar portadas de juegos</label>
            {coverImages ? <div className={styles.layoutModes} role="group" aria-label="Composición de portadas">
              <label><input type="radio" name="cover-layout" value="tiles" checked={coverLayout === "tiles"} onChange={() => setCoverLayout("tiles")} />Mosaico</label>
              <label><input type="radio" name="cover-layout" value="strips" checked={coverLayout === "strips"} onChange={() => setCoverLayout("strips")} />Divisiones verticales</label>
            </div> : null}
            <label><input type="checkbox" checked={showCallout} onChange={event => setShowCallout(event.target.checked)} />Mostrar invitación a deslizar</label>
            {showCallout ? <label>Invitación a deslizar<input maxLength={80} value={coverCallout} onChange={event => setCoverCallout(event.target.value)} /></label> : null}</> : null}
        </fieldset>
        <fieldset disabled={Boolean(busy)} className={styles.settings}>
          <legend>Juegos</legend>
          <label><input type="checkbox" checked={options.showEyebrow} onChange={event => setOptions(current => ({ ...current, showEyebrow: event.target.checked }))} />Mostrar epígrafe</label>
          {options.showEyebrow ? <label>Epígrafe<input maxLength={60} value={options.eyebrow} onChange={event => setOptions(current => ({ ...current, eyebrow: event.target.value }))} /></label> : null}
          <label><input type="checkbox" checked={options.hideMissing} onChange={event => setOptions(current => ({ ...current, hideMissing: event.target.checked }))} />Ocultar tiendas sin dato</label>
          <label><input type="checkbox" checked={options.hideStale} onChange={event => setOptions(current => ({ ...current, hideStale: event.target.checked }))} />Excluir precios desactualizados</label>
          <label><input type="checkbox" checked={options.discounts} onChange={event => setOptions(current => ({ ...current, discounts: event.target.checked }))} />Mostrar descuentos</label>
          <label><input type="checkbox" checked={options.lows} onChange={event => setOptions(current => ({ ...current, lows: event.target.checked }))} />Mostrar mínimos históricos</label>
          {selected ? <>
          <label>Título<input value={selected.headline} maxLength={90} onChange={event => edit({ headline: event.target.value })} /></label>
          <label>Descripción<textarea value={selected.description} maxLength={170} rows={3} onChange={event => edit({ description: event.target.value })} /><small>{selected.description.length}/170</small></label>
          {includeCover && coverImages && coverLayout === "strips" ? <div className={styles.cropControl}>
            <label>Encuadre de portada<input type="range" aria-label={`Encuadre de ${selected.game.title}`} min={0} max={100} step={1} value={selected.coverPosition ?? 50} onChange={event => { edit({ coverPosition: Number(event.target.value) }); setPreview("cover"); }} /></label>
            <button type="button" title="Volver al centro" aria-label="Volver al centro" onClick={() => { edit({ coverPosition: 50 }); setPreview("cover"); }}><RefreshCw size={16} /></button>
          </div> : null}
          </> : null}
        </fieldset>
        <fieldset disabled={Boolean(busy)} className={styles.settings}>
          <legend>Cierre</legend>
          <label><input type="checkbox" checked={includeCta} disabled={!includeCta && total >= MAX_PUBLICATION_IMAGES} onChange={event => { setIncludeCta(event.target.checked); if (!event.target.checked && preview === "cta") setPreview("game"); }} />Incluir cierre BARATEAM</label>
          {includeCta ? <label>Pregunta para la audiencia (opcional)<input maxLength={120} value={ctaQuestion} onChange={event => setCtaQuestion(event.target.value)} /></label> : null}
        </fieldset>
      </div>
      <div className={styles.preview}>
        <div className={styles.previewBar}><span>1080 × 1350</span>{selected ? <div>
          <button disabled={Boolean(busy)} aria-pressed={preview === "game"} onClick={() => setPreview("game")}>Juego</button>
          {includeCover ? <button disabled={Boolean(busy)} aria-pressed={preview === "cover"} onClick={() => setPreview("cover")}>Portada</button> : null}
          {includeCta ? <button disabled={Boolean(busy)} aria-pressed={preview === "cta"} onClick={() => setPreview("cta")}>Cierre</button> : null}
        </div> : null}</div>
        {selected ? <div ref={viewport} className={styles.viewport}>
          <div style={{ transform: `scale(${width / 1080})`, transformOrigin: "top left" }}>
            {preview === "cover" && includeCover ? <PublicationCover drafts={drafts} title={coverTitle} subtitle={coverSubtitle ?? undefined} showSubtitle={showCoverSubtitle} showImages={coverImages} layout={coverLayout} showCallout={showCallout} callout={coverCallout} total={total} /> : preview === "cta" && includeCta ? <PublicationCta drafts={drafts} question={ctaQuestion} total={total} backgroundGames={backgroundGames} /> : <PublicationPoster draft={selected} options={options} index={drafts.indexOf(selected) + 1 + Number(includeCover)} total={total} />}
          </div>
        </div> : <div className={styles.empty}><ImagePlus size={32} /><p>Elegí un juego</p></div>}
        <div className={styles.actions}>
          <button disabled={!selected || Boolean(busy) || stale || missingPrices} onClick={() => void download(false)}><Download size={17} />PNG</button>
          <button disabled={!selected || Boolean(busy) || stale || missingPrices} onClick={() => void download(true)}><Download size={17} />Carrusel ZIP</button>
          <button disabled={!drafts.length || Boolean(busy)} onClick={() => void copyCaption()} title="Copiar texto de publicación" aria-label="Copiar texto de publicación"><Copy size={17} /></button>
        </div>
        <p className={styles.status} role="status">{busy ? <><LoaderCircle size={16} />{busy}</> : message}</p>
        {drafts.length ? <details className={styles.caption}><summary>Texto de publicación</summary><textarea aria-label="Texto de publicación" readOnly value={caption} rows={8} /></details> : null}
      </div>
    </div>
    <div className={styles.exportRoot} ref={exports} aria-hidden="true">
      {includeCover && drafts.length ? <div data-publication-export="cover"><PublicationCover drafts={drafts} title={coverTitle} subtitle={coverSubtitle ?? undefined} showSubtitle={showCoverSubtitle} showImages={coverImages} layout={coverLayout} showCallout={showCallout} callout={coverCallout} total={total} /></div> : null}
      {drafts.map((draft, index) => <div key={draft.game.id} data-publication-export={`game-${draft.game.id}`}><PublicationPoster draft={draft} options={options} index={index + 1 + Number(includeCover)} total={total} /></div>)}
      {includeCta && drafts.length ? <div data-publication-export="cta"><PublicationCta drafts={drafts} question={ctaQuestion} total={total} backgroundGames={backgroundGames} /></div> : null}
    </div>
  </section>;
}

function errorText(reason: unknown) { return reason instanceof Error ? reason.message : "No pudimos completar la operación. Reintentá."; }
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80); }
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
