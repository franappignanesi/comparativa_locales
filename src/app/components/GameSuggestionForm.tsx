"use client";

import Link from "next/link";
import { Check, LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { parseSuggestionLink } from "@/lib/game-suggestion-link";
import type { SuggestionPreview } from "@/lib/game-suggestion-types";

export function GameSuggestionForm({ loggedIn, onClose }: { loggedIn: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<SuggestionPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPreview(null); setError(""); setTitle(""); setChecking(false);
    if (!url.trim() || !loggedIn) return;
    try { parseSuggestionLink(url); } catch (e) { setError((e as Error).message); return; }
    const controller = new AbortController();
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", url }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.message || "No pudimos identificar el juego.");
        if (!controller.signal.aborted) { setPreview(data.preview); setTitle(data.preview.title ?? ""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar la tienda."); }
      finally { if (!controller.signal.aborted) setChecking(false); }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url, loggedIn]);

  async function submit() {
    if (sending || !preview || preview.existingGameId) return;
    setSending(true); setError("");
    try {
      const response = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, title }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || "No pudimos enviar la propuesta.");
      if (data.preview?.existingGameId) setPreview(data.preview);
      else setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos enviar la propuesta."); }
    finally { setSending(false); }
  }
  return <div className="problemReportPanel gameSuggestionPanel" role="dialog" aria-label="Proponer un juego faltante">
    <div className="problemReportHeader"><strong>Proponer un juego faltante</strong><button type="button" onClick={onClose} aria-label="Cerrar propuesta"><X size={16} /></button></div>
    {!loggedIn ? <div className="problemReportLogin"><p>Iniciá sesión para proponer juegos y evitar propuestas duplicadas.</p><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"))}>Iniciar sesión</button></div>
      : sent ? <div className="problemReportThanks" role="status"><Check size={24} /><p>¡Gracias! Guardamos tu propuesta para revisarla.</p></div>
      : <>
        <label>Enlace del juego<input type="url" value={url} onChange={e => setUrl(e.target.value)} maxLength={1000} placeholder="https://store.steampowered.com/app/..." disabled={sending} /></label>
        <small>Steam, Epic, GOG, Humble o Microsoft.</small>
        {checking ? <p className="suggestionChecking" role="status"><LoaderCircle size={16} className="suggestionSpinner" /> Consultando la tienda...</p> : null}
        {preview?.title ? <div className="suggestionPreview">{preview.coverUrl ? <img src={preview.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}<strong>{preview.title}</strong></div> : null}
        {preview?.existingGameId ? <p>Este juego ya está en BARATEAM. <Link href={`/juegos/${preview.existingGameId}`}>Ver ficha</Link></p> : null}
        {preview && !preview.title ? <label>No pudimos identificar el nombre. Podés enviarlo igual.<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Nombre del juego (opcional)" /></label> : null}
        {error ? <p className="problemReportError" role="alert">{error}</p> : null}
        <button className="problemReportSubmit" type="button" onClick={submit} disabled={!preview || !!preview.existingGameId || checking || sending}><Send size={15} />{sending ? "Enviando..." : "Enviar propuesta"}</button>
      </>}
  </div>;
}
