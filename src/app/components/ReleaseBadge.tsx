"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#ffcf00", "#68e0c5", "#ff7b95", "#ffffff", "#82bbff"];
const PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  color: COLORS[index % COLORS.length],
  dx: (index - 13.5) * 15,
  rise: -90 - index % 7 * 18,
  fall: 120 + index % 5 * 25,
  delay: index % 4 * 25
}));

export function ReleaseBadge() {
  const [burst, setBurst] = useState<{ id: number; x: number; y: number; motion: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span className="releaseBadge">
      <button
        className="releaseBadgeButton"
        type="button"
        title="Celebrar BARATEAM 1.0"
        aria-label="Celebrar BARATEAM 1.0"
        onClick={event => {
          if (timer.current) clearTimeout(timer.current);
          const rect = event.currentTarget.getBoundingClientRect();
          setBurst({ id: ++sequence.current, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
          timer.current = setTimeout(() => setBurst(null), 1600);
        }}
      >
        <span aria-hidden="true">🤙</span>
      </button>
      <span className="releaseBadgeNotice" role="status" aria-live="polite">
        {burst ? <span key={burst.id}>1.0!</span> : null}
      </span>
      {burst?.motion ? createPortal(
        <div className="releaseConfetti" aria-hidden="true" key={burst.id}>
          {PARTICLES.map((particle, index) => (
            <i key={index} style={{
              left: burst.x, top: burst.y, backgroundColor: particle.color,
              "--confetti-x": `${particle.dx}px`, "--confetti-rise": `${burst.y < 120 ? 25 + index % 7 * 14 : particle.rise}px`,
              "--confetti-fall": `${particle.fall}px`, animationDelay: `${particle.delay}ms`
            } as CSSProperties} />
          ))}
        </div>, document.body
      ) : null}
    </span>
  );
}
