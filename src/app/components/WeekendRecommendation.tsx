"use client";

import { Check, ExternalLink, Instagram, Share2, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatWeekendDate, instagramEmbedUrl, type WeekendGame } from "@/lib/weekend-games";

export function WeekendTag() {
  return <span className="weekendTag">JUEGO DEL FINDE</span>;
}

export function WeekendRecommendation({ game, gameId }: { game: WeekendGame; gameId: string }) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const embedUrl = instagramEmbedUrl(game.videoUrl);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(Boolean(embedUrl));
  const [nativeVideoFailed, setNativeVideoFailed] = useState(false);
  const useNativeVideo = Boolean(videoUrl) && !nativeVideoFailed;

  useEffect(() => {
    if (!embedUrl) return;
    const controller = new AbortController();
    let active = true;
    setVideoLoading(true);
    setVideoUrl(null);
    setNativeVideoFailed(false);
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    fetch(`/api/weekend-video?appId=${game.steamAppId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("video_unavailable");
        const result = await response.json() as { videoUrl?: string | null };
        if (active) setVideoUrl(result.videoUrl || null);
      })
      .catch(() => { if (active) setVideoUrl(null); })
      .finally(() => { window.clearTimeout(timeout); if (active) setVideoLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [embedUrl, game.steamAppId]);
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
        <div className={embedUrl && !videoLoading && !useNativeVideo ? "weekendReel weekendReelEmbed" : "weekendReel"}>
          {videoLoading ? <div className="weekendVideoLoading" role="status"><LoaderCircle size={24} /><span>Cargando video...</span></div>
            : useNativeVideo ? <video key={videoUrl} src={videoUrl!} controls playsInline preload="metadata" aria-label={`Juego del finde de Shux: ${game.title}`} onError={() => setNativeVideoFailed(true)} />
            : embedUrl ? <InstagramFrame src={embedUrl} title={`Reel de Shux: ${game.title}`} />
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

function InstagramFrame({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.instagram.com" || event.source !== frameRef.current?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const measured = Number(message?.details?.height);
        if (message?.type === "MEASURE" && Number.isFinite(measured) && measured >= 200 && measured <= 2000) setHeight(Math.ceil(measured));
      } catch { /* Ignore unrelated frame messages. */ }
    }
    window.addEventListener("message", onMessage);
    const observer = new ResizeObserver(([entry]) => { setWidth(entry.contentRect.width); });
    if (frameRef.current) observer.observe(frameRef.current);
    return () => { observer.disconnect(); window.removeEventListener("message", onMessage); };
  }, []);
  return <iframe ref={frameRef} key={src} src={src} title={title} scrolling="no" style={{ height: height ?? Math.ceil(width * 16 / 9 + 200) }} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />;
}
