"use client";

import Link from "next/link";
import { Check, ExternalLink, LoaderCircle, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SUGGESTION_STATUS_LABELS, type GameSuggestion } from "@/lib/game-suggestion-types";

export function AdminGameSuggestions() {
  const [items, setItems] = useState<GameSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function reload() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/suggestions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.message);
      setItems(data.suggestions);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos cargar las propuestas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  async function action(id: string | null, command: "search" | "approve" | "discard") {
    if (busy || (command === "discard" && !window.confirm("¿Descartar esta propuesta? Se conservará el registro."))) return;
    setBusy(id ?? "all"); setError("");
    try {
      const response = await fetch("/api/admin/suggestions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: command }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.message);
      setItems(data.suggestions);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos actualizar la propuesta."); }
    finally { setBusy(null); }
  }
  const pending = items.filter(s => ["pending", "review"].includes(s.status));
  return <section className="adminGameSuggestions">
    <div className="suggestionAdminToolbar"><p>Las búsquedas e incorporaciones se procesan en la actualización diaria. Aprobar no publica inmediatamente.</p><button type="button" onClick={reload} disabled={loading || !!busy} title="Actualizar lista" aria-label="Actualizar lista"><RefreshCw size={17} /></button><button type="button" onClick={() => action(null, "search")} disabled={!pending.length || !!busy}><Search size={16} />Buscar todos los pendientes</button></div>
    {error ? <p role="alert" className="problemReportError">{error}</p> : null}
    {busy ? <p role="status"><LoaderCircle size={16} className="suggestionSpinner" /> Guardando cambios...</p> : null}
    {loading ? <p role="status"><LoaderCircle size={16} className="suggestionSpinner" /> Cargando propuestas...</p> : !items.length ? <p>Todavía no hay juegos sugeridos.</p> : items.map(item => <article key={item.id} className="suggestionAdminRow">
      {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
      <div><strong>{item.title ?? "Juego sin identificar"}</strong><small>{item.store} · {item.supporters} {item.supporters === 1 ? "persona lo pidió" : "personas lo pidieron"} · {new Date(item.createdAt).toLocaleDateString("es-AR")}</small><span className="suggestionStatus">{SUGGESTION_STATUS_LABELS[item.status]}</span><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Ver enlace propuesto</a>
        {item.candidate ? <p>{item.candidate.title} · {item.candidate.productKind === "pack" ? "Pack / colección" : "Juego"} · Tiendas comprobadas: {item.candidate.expectedStores.join(", ")}</p> : null}
        {item.message ? <p>{item.message}</p> : null}
        {item.status === "published" && item.gameId ? <Link href={`/juegos/${item.gameId}`}>Ver ficha publicada</Link> : null}
      </div>
      <div className="suggestionAdminActions">
        {["pending", "ready", "review"].includes(item.status) ? <button type="button" onClick={() => action(item.id, "search")} disabled={!!busy}><Search size={15} />Buscar coincidencias</button> : null}
        {item.status === "ready" && item.candidate ? <button type="button" onClick={() => action(item.id, "approve")} disabled={!!busy}><Check size={15} />Agregar</button> : null}
        {["pending", "queued", "ready", "review", "approved"].includes(item.status) ? <button type="button" onClick={() => action(item.id, "discard")} disabled={!!busy}><Trash2 size={15} />Descartar</button> : null}
        {busy === item.id ? <LoaderCircle size={16} className="suggestionSpinner" /> : null}
      </div>
    </article>)}
  </section>;
}
