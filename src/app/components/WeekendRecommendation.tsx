"use client";

import { Check, ExternalLink, Instagram, Share2 } from "lucide-react";
import { useState } from "react";
import { formatWeekendDate, instagramEmbedUrl, type WeekendGame } from "@/lib/weekend-games";

export function WeekendTag() {
  return <span className="weekendTag">JUEGO DEL FINDE</span>;
}

export function WeekendRecommendation({ game, gameId }: { game: WeekendGame; gameId: string }) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const embedUrl = instagramEmbedUrl(game.videoUrl);
  async function share() {
    const url = new URL(`/biblioteca/juego-del-finde?game=${encodeURIComponent(gameId)}`, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: `${game.title} · Juego del finde de Shux`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
      setShareError(false);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setShareError(true);
    }
  }
  return (
    <section className="weekendRecommendation" aria-label="Recomendación de Shux">
      <h3>¡Este fue nuestro juego del finde el {formatWeekendDate(game)} en Shux!</h3>
      <div className="weekendReelLayout">
        <div className="weekendReel">
          {embedUrl ? <iframe key={embedUrl} src={embedUrl} title={`Reel de Shux: ${game.title}`} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            : <a href={game.videoUrl} target="_blank" rel="noopener noreferrer">Ver recomendación <ExternalLink size={18} /></a>}
        </div>
        <div className="weekendReelAside">
          <p>{game.review}</p>
          <a className="weekendAction" href={game.videoUrl} target="_blank" rel="noopener noreferrer"><Instagram size={18} />Ver en Instagram</a>
          <a className="weekendAction" href={game.mentorUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />Ver en Mentor de Steam</a>
          <button className="weekendAction" type="button" onClick={share}>{copied ? <Check size={18} /> : <Share2 size={18} />}{copied ? "Enlace copiado" : "Compartir"}</button>
          {shareError ? <p role="status">No pudimos compartir el enlace. <a href={game.videoUrl}>Abrir el video</a></p> : null}
        </div>
      </div>
    </section>
  );
}
