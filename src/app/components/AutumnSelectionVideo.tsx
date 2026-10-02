import { ExternalLink } from "lucide-react";

export function AutumnSelectionVideo() {
  return (
    <article className="autumnVideoCard" aria-labelledby="autumn-video-title">
      <div className="autumnVideoPlayer">
        <iframe
          src="https://www.youtube-nocookie.com/embed/9j-vlNXnpV4"
          title="Selección de ofertas de otoño de SHUX en YouTube"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="autumnVideoCopy">
        <h3 id="autumn-video-title">¡Mirá el video de estas ofertas en YouTube!</h3>
        <a href="https://www.youtube.com/watch?v=9j-vlNXnpV4" target="_blank" rel="noopener noreferrer">
          Ver en YouTube <ExternalLink size={16} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
