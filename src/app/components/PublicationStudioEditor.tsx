"use client";

import { ArrowDown, ArrowUp, Copy, Download, ImagePlus, LoaderCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/regions";
import { STORES } from "@/lib/types";
import { STORE_NAMES } from "@/lib/seo";
import { MAX_PUBLICATION_IMAGES, publicationCaption, type PublicationGame } from "@/lib/social-publications";
import { duplicateStudioPlate, MODE_PLATES, moveStudioPlate, newStudioDraft, newStudioPlate, PLATE_LABELS, publicationDimensions, restoreStudioDraft, studioPlateError, studioPrices,
  type PlateKind, type StudioDraft, type StudioMode, type StudioPlate } from "@/lib/publication-studio";
import { readPublicationUpload, readStudioDraft, saveStudioDraft } from "@/lib/publication-studio-storage";
import { downloadPublicationImages } from "@/lib/publication-export";
import { PublicationStudioPoster } from "./PublicationStudioPoster";
import styles from "./publications.module.css";

type SearchGame = { id: string; title: string };
const MODE_NAMES: Record<StudioMode, string> = { news: "Noticias", story: "Historia de juego", comparison: "Gráfico comparativo", versus: "Versus" };
async function loadGame(id: string, region: RegionId): Promise<PublicationGame> {
  const response = await fetch(`/api/admin/publications?gameId=${encodeURIComponent(id)}&region=${region}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Tu sesión admin venció. Volvé a iniciar sesión." : "No pudimos cargar el juego. Reintentá.");
  return (await response.json()).game;
}
function draftGameIds(draft: StudioDraft) { return [...new Set([...draft.gameIds, ...draft.plates.map(plate => plate.coverGameId)].filter(Boolean))]; }

export function PublicationStudioEditor({ mode, initialRegion }: { mode: StudioMode; initialRegion: RegionId }) {
  const [draft, setDraft] = useState(() => { let index = 0; return newStudioDraft(mode, initialRegion, () => `${mode}-${index++}`); });
  const [games, setGames] = useState<Record<string, PublicationGame>>({});
  const [active, setActive] = useState(draft.plates[0]?.id ?? "");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchGame[]>([]);
  const [searching, setSearching] = useState(false);
  const [gameTarget, setGameTarget] = useState<"first" | "second" | "image">(mode === "news" ? "image" : "first");
  const [newKind, setNewKind] = useState<PlateKind>(MODE_PLATES[mode][0]);
  const [width, setWidth] = useState(400);
  const viewport = useRef<HTMLDivElement>(null);
  const exports = useRef<HTMLDivElement>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const selected = draft.plates.find(plate => plate.id === active) ?? draft.plates[0];
  const dimensions = publicationDimensions(draft.format);
  const disabled = Boolean(busy) || !ready;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy("Restaurando borrador...");
      try {
        const saved = restoreStudioDraft(await readStudioDraft(mode), mode);
        if (cancelled) return;
        if (saved) {
          setDraft(saved); setActive(saved.plates[0]?.id ?? "");
          const restored: Record<string, PublicationGame> = {};
          for (const id of draftGameIds(saved)) {
            if (cancelled) return;
            restored[id] = await loadGame(id, saved.region);
          }
          if (!cancelled) setGames(restored);
        }
      } catch (reason) { if (!cancelled) setError(errorText(reason)); }
      finally { if (!cancelled) { setReady(true); setBusy(""); } }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void saveStudioDraft(draft).catch(reason => setError(errorText(reason))); }, 350);
    return () => clearTimeout(timer);
  }, [draft, ready]);

  useEffect(() => {
    if (!ready) return;
    // Flush the latest editorial choices when switching generators, including uploaded images.
    return () => { void saveStudioDraft(latestDraft.current).catch(() => {}); };
  }, [ready]);

  useEffect(() => {
    if (mode === "comparison") return;
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(`/api/admin/publications?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("No pudimos buscar juegos. Revisá tu sesión admin.");
        const data = await response.json();
        if (!controller.signal.aborted) setResults(data.games ?? []);
      }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, mode]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [Boolean(selected)]);

  function edit(changes: Partial<StudioPlate>) {
    if (!selected) return;
    setDraft(current => ({ ...current, plates: current.plates.map(plate => plate.id === selected.id ? { ...plate, ...changes } : plate) }));
  }
  async function chooseGame(id: string) {
    if (disabled) return;
    setBusy("Cargando juego..."); setError("");
    try {
      const game = await loadGame(id, draft.region);
      setGames(current => ({ ...current, [id]: game }));
      if (gameTarget === "image") edit({ coverGameId: id, image: null });
      else setDraft(current => { const gameIds = [...current.gameIds]; gameIds[gameTarget === "second" ? 1 : 0] = id; return { ...current, gameIds }; });
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }
  async function refresh(region = draft.region) {
    setBusy("Consultando precios guardados..."); setError("");
    try {
      const updated: Record<string, PublicationGame> = {};
      for (const id of draftGameIds(draft)) updated[id] = await loadGame(id, region);
      setGames(updated); setDraft(current => ({ ...current, region }));
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }
  async function upload(file: File | undefined, rowId?: string) {
    if (!file || !selected || disabled) return;
    setBusy("Procesando imagen..."); setError("");
    try {
      const image = await readPublicationUpload(file);
      edit(rowId ? { rows: selected.rows.map(row => row.id === rowId ? { ...row, image } : row) } : { image, coverGameId: "" });
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }
  function addPlate() {
    if (disabled || draft.plates.length >= MAX_PUBLICATION_IMAGES) return;
    const plate = newStudioPlate(newKind, crypto.randomUUID());
    if (mode === "news" && plate.kind === "cta") plate.body = "Seguinos en @shuxteam";
    setDraft(current => ({ ...current, plates: [...current.plates, plate] })); setActive(plate.id);
  }
  async function download(all: boolean) {
    if (disabled || !selected) return;
    const plates = all ? draft.plates : [selected];
    const issue = plates.map(plate => studioPlateError(plate, draft.gameIds, games)).find(Boolean);
    if (issue) { setError(issue); return; }
    setError(""); setMessage(""); setBusy("Preparando imágenes...");
    try {
      const wrappers = [...exports.current!.querySelectorAll<HTMLElement>("[data-publication-export]")].filter(node => all || node.dataset.publicationExport === selected.id);
      const priceDrafts = draft.gameIds.flatMap((id, slot) => {
        const game = games[id];
        const pricePlates = plates.filter(plate => plate.kind === "versus-prices" || plate.kind === "game-offer" && plate.gameSlot === slot);
        if (!game || !pricePlates.length) return [];
        const stores = [...new Set(pricePlates.flatMap(plate => plate.stores))];
        return [{ game: { ...game, prices: studioPrices(game, stores) }, headline: game.title, description: "" }];
      });
      const caption = plates.map(plate => [plate.title, plate.body].filter(Boolean).join("\n")).join("\n\n") + (priceDrafts.length ? `\n\n${publicationCaption(priceDrafts, MODE_NAMES[mode])}` : "\n\n@shuxteam");
      await downloadPublicationImages({ nodes: wrappers.map(wrapper => ({ node: wrapper.firstElementChild as HTMLElement,
        name: `${String(draft.plates.findIndex(plate => plate.id === wrapper.dataset.publicationExport) + 1).padStart(2, "0")}-${mode}.png` })),
        all, filename: `shux-${mode}-${draft.format}`, caption, progress: setBusy });
      setMessage(all ? "Placas descargadas." : "Imagen descargada.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }

  return <section className={styles.generator} aria-label={`Generador: ${MODE_NAMES[mode]}`}>
    <div className={styles.toolbar}><h2>{MODE_NAMES[mode]}</h2><div>
      <select aria-label="Formato de publicación" value={draft.format} disabled={disabled} onChange={event => setDraft(current => ({ ...current, format: event.target.value === "story" ? "story" : "post" }))}><option value="post">Post 4:5</option><option value="story">Historia 9:16</option></select>
      {mode !== "news" && mode !== "comparison" ? <select aria-label="País de la publicación" value={draft.region} disabled={disabled} onChange={event => void refresh(event.target.value as RegionId)}>{REGIONS.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}</select> : null}
      <button disabled={disabled} title="Actualizar precios guardados" aria-label="Actualizar precios guardados" onClick={() => void refresh()}><RefreshCw size={17} /></button>
    </div></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.workspace}><div className={styles.editor}>
      {mode !== "comparison" ? <fieldset className={styles.settings} disabled={disabled}><legend>{mode === "news" ? "Imagen de un juego" : "Juegos"}</legend>
        {mode !== "news" ? <label>Destino<select aria-label="Destino del juego" value={gameTarget} onChange={event => setGameTarget(event.target.value as typeof gameTarget)}><option value="first">{mode === "versus" ? "Juego 1" : "Juego de la historia"}</option>{mode === "versus" ? <option value="second">Juego 2</option> : null}<option value="image">Imagen de esta placa</option></select></label> : null}
        {draft.gameIds.map((id, index) => id ? <span className={styles.selectedGame} key={index}>{index + 1}. {games[id]?.title ?? "Cargando juego..."}</span> : null)}
        <label className={styles.search}><Search size={16} /><input placeholder="Buscar juego..." aria-label="Buscar juego para la placa" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /></label>
        <div className={styles.results}>{searching ? <span className={styles.status}><LoaderCircle size={16} />Buscando...</span> : results.map(game => <button type="button" key={game.id} onClick={() => void chooseGame(game.id)}><span>{game.title}</span><Plus size={16} /></button>)}</div>
      </fieldset> : null}
      <h3>Placas <span>{draft.plates.length}/{MAX_PUBLICATION_IMAGES}</span></h3>
      <ol className={`${styles.queue} ${styles.studioQueue}`}>{draft.plates.map((plate, index) => <li key={plate.id}>
        <button className={selected?.id === plate.id ? styles.current : ""} disabled={disabled} onClick={() => setActive(plate.id)}><span>{index + 1}. {PLATE_LABELS[plate.kind]}</span></button>
        <button disabled={disabled || index === 0} aria-label={`Mover placa ${index + 1} arriba`} title="Mover arriba" onClick={() => setDraft(current => ({ ...current, plates: moveStudioPlate(current.plates, plate.id, -1) }))}><ArrowUp size={15} /></button>
        <button disabled={disabled || index === draft.plates.length - 1} aria-label={`Mover placa ${index + 1} abajo`} title="Mover abajo" onClick={() => setDraft(current => ({ ...current, plates: moveStudioPlate(current.plates, plate.id, 1) }))}><ArrowDown size={15} /></button>
        <button disabled={disabled || draft.plates.length >= MAX_PUBLICATION_IMAGES} aria-label={`Duplicar placa ${index + 1}`} title="Duplicar" onClick={() => { const id = crypto.randomUUID(); setDraft(current => ({ ...current, plates: duplicateStudioPlate(current.plates, plate.id, id) })); setActive(id); }}><Copy size={15} /></button>
        <button disabled={disabled} aria-label={`Quitar placa ${index + 1}`} title="Quitar" onClick={() => setDraft(current => ({ ...current, plates: current.plates.filter(item => item.id !== plate.id) }))}><Trash2 size={15} /></button>
      </li>)}</ol>
      <div className={styles.addPlate}><select aria-label="Tipo de placa nueva" value={newKind} disabled={disabled} onChange={event => setNewKind(event.target.value as PlateKind)}>{MODE_PLATES[mode].map(kind => <option key={kind} value={kind}>{PLATE_LABELS[kind]}</option>)}</select><button disabled={disabled || draft.plates.length >= MAX_PUBLICATION_IMAGES} onClick={addPlate}><Plus size={17} />Agregar placa</button></div>
      {selected ? <>
        <fieldset className={styles.settings} disabled={disabled}><legend>{PLATE_LABELS[selected.kind]}</legend>
          <label>Título<input value={selected.title} maxLength={180} onChange={event => edit({ title: event.target.value })} /></label>
          <label>Texto<textarea value={selected.body} maxLength={1600} rows={5} onChange={event => edit({ body: event.target.value })} /></label>
          <label><input type="checkbox" checked={selected.showEyebrow} onChange={event => edit({ showEyebrow: event.target.checked })} />Mostrar epígrafe</label>
          {selected.showEyebrow ? <label>Epígrafe<input value={selected.eyebrow} maxLength={80} onChange={event => edit({ eyebrow: event.target.value })} /></label> : null}
          {mode === "versus" && selected.kind === "game-feature" ? <label>Juego de la placa<select value={selected.gameSlot} onChange={event => edit({ gameSlot: event.target.value === "1" ? 1 : 0 })}><option value="0">Juego 1</option><option value="1">Juego 2</option></select></label> : null}
          {draft.format === "story" ? <label><input type="checkbox" checked={selected.reserveLink} onChange={event => edit({ reserveLink: event.target.checked })} />Reservar espacio para enlace de Instagram</label> : null}
        </fieldset>
        {["headline-image", "text-image", "image-caption", "game-offer", "game-feature", "versus-cover"].includes(selected.kind) ? <fieldset className={styles.settings} disabled={disabled}><legend>Imagen</legend>
          <label className={styles.uploadButton}><ImagePlus size={17} />Subir imagen<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Subir imagen de la placa" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
          {selected.image || selected.coverGameId ? <button onClick={() => edit({ image: null, coverGameId: "" })}><Trash2 size={15} />Quitar imagen personalizada</button> : null}
          <details className={styles.cropPanel}><summary>Encuadre de imagen</summary><label>Horizontal<input type="range" min={0} max={100} value={selected.imageX} onChange={event => edit({ imageX: Number(event.target.value) })} /></label><label>Vertical<input type="range" min={0} max={100} value={selected.imageY} onChange={event => edit({ imageY: Number(event.target.value) })} /></label>
            {selected.kind === "versus-cover" ? <><label>Juego 2 · horizontal<input type="range" min={0} max={100} value={selected.secondX} onChange={event => edit({ secondX: Number(event.target.value) })} /></label><label>Juego 2 · vertical<input type="range" min={0} max={100} value={selected.secondY} onChange={event => edit({ secondY: Number(event.target.value) })} /></label></> : null}
          </details>
        </fieldset> : null}
        {["game-offer", "versus-prices"].includes(selected.kind) ? <fieldset className={styles.settings} disabled={disabled}><legend>Precios</legend>
          <div className={styles.storeChoices}>{STORES.map(store => <label key={store}><input type="checkbox" checked={selected.stores.includes(store)} onChange={event => edit({ stores: event.target.checked ? [...selected.stores, store] : selected.stores.filter(item => item !== store) })} />{STORE_NAMES[store]}</label>)}</div>
          <label><input type="checkbox" checked={selected.discounts} onChange={event => edit({ discounts: event.target.checked })} />Mostrar descuentos</label>
          <label><input type="checkbox" checked={selected.lows} onChange={event => edit({ lows: event.target.checked })} />Mostrar mínimos históricos</label>
        </fieldset> : null}
        {selected.kind === "bar-chart" ? <fieldset className={styles.settings} disabled={disabled}><legend>Elementos del gráfico</legend>
          <label>Unidad<input value={selected.unit} maxLength={20} placeholder="FPS, %, GB..." onChange={event => edit({ unit: event.target.value })} /></label>
          {selected.rows.map((row, index) => <div className={styles.chartRowEditor} key={row.id}>
            <label>Nombre {index + 1}<input value={row.label} maxLength={70} onChange={event => edit({ rows: selected.rows.map(item => item.id === row.id ? { ...item, label: event.target.value } : item) })} /></label>
            <label>Valor<input inputMode="decimal" value={row.value} maxLength={30} onChange={event => edit({ rows: selected.rows.map(item => item.id === row.id ? { ...item, value: event.target.value } : item) })} /></label>
            <label><input type="checkbox" checked={row.showValue} onChange={event => edit({ rows: selected.rows.map(item => item.id === row.id ? { ...item, showValue: event.target.checked } : item) })} />Mostrar valor</label>
            <label className={styles.uploadButton}><ImagePlus size={15} />PNG / imagen<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Imagen del elemento ${index + 1}`} onChange={event => { void upload(event.target.files?.[0], row.id); event.target.value = ""; }} /></label>
            <div className={styles.rowActions}>{row.image ? <button title="Quitar imagen" aria-label={`Quitar imagen del elemento ${index + 1}`} onClick={() => edit({ rows: selected.rows.map(item => item.id === row.id ? { ...item, image: null } : item) })}><ImagePlus size={15} /></button> : null}
              <button disabled={index === 0} title="Mover arriba" aria-label={`Mover elemento ${index + 1} arriba`} onClick={() => { const rows = [...selected.rows]; [rows[index], rows[index - 1]] = [rows[index - 1], rows[index]]; edit({ rows }); }}><ArrowUp size={15} /></button>
              <button disabled={index === selected.rows.length - 1} title="Mover abajo" aria-label={`Mover elemento ${index + 1} abajo`} onClick={() => { const rows = [...selected.rows]; [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]]; edit({ rows }); }}><ArrowDown size={15} /></button>
              <button title="Quitar elemento" aria-label={`Quitar elemento ${index + 1}`} onClick={() => edit({ rows: selected.rows.filter(item => item.id !== row.id) })}><Trash2 size={15} /></button>
            </div>
          </div>)}
          <button disabled={selected.rows.length >= 12} onClick={() => edit({ rows: [...selected.rows, { id: crypto.randomUUID(), label: "", value: "", image: null, showValue: true }] })}><Plus size={17} />Agregar elemento ({selected.rows.length}/12)</button>
        </fieldset> : null}
      </> : null}
    </div><div className={styles.preview}>
      <div className={styles.previewBar}><span>{dimensions.width} × {dimensions.height}</span><span>{selected ? `${draft.plates.indexOf(selected) + 1} / ${draft.plates.length}` : ""}</span></div>
      {selected ? <div className={styles.viewport} ref={viewport} data-preview="true" style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}><div style={{ height: dimensions.height, transform: `scale(${width / dimensions.width})`, transformOrigin: "top left" }}><PublicationStudioPoster key={`${selected.id}-${draft.format}`} draft={draft} plate={selected} games={games} index={draft.plates.indexOf(selected)} /></div></div> : <div className={styles.empty}><ImagePlus size={32} /><p>Sin placas</p></div>}
      <div className={styles.actions}><button disabled={disabled || !selected} onClick={() => void download(false)}><Download size={17} />PNG</button><button disabled={disabled || !selected} onClick={() => void download(true)}><Download size={17} />Todas las placas ZIP</button></div>
      <p className={styles.status} role="status">{busy ? <><LoaderCircle size={16} />{busy}</> : message || (ready ? "Borrador local" : "")}</p>
      {selected && studioPlateError(selected, draft.gameIds, games) ? <p className={styles.status}>{studioPlateError(selected, draft.gameIds, games)}</p> : null}
    </div></div>
    <div className={styles.exportRoot} ref={exports} aria-hidden="true">{draft.plates.map((plate, index) => <div key={`${plate.id}-${draft.format}`} data-publication-export={plate.id}><PublicationStudioPoster draft={draft} plate={plate} games={games} index={index} /></div>)}</div>
  </section>;
}
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : "No pudimos completar la operación."; }
