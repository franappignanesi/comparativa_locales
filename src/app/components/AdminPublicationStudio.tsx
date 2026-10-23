"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { RegionId } from "@/lib/regions";
import type { StudioMode } from "@/lib/publication-studio";
import styles from "./publications.module.css";

const Legacy = dynamic(() => import("./AdminPublications").then(module => module.AdminPublications));
const Editor = dynamic(() => import("./PublicationStudioEditor").then(module => module.PublicationStudioEditor));

export function AdminPublicationStudio({ initialRegion }: { initialRegion: RegionId }) {
  const [mode, setMode] = useState<"offers" | StudioMode>("offers");
  return <div className={styles.generator}>
    <nav className={styles.studioModes} aria-label="Tipo de publicación">{([
      ["offers", "Carrusel de ofertas"], ["story", "Historia de juego"], ["news", "Noticias"], ["comparison", "Gráfico comparativo"], ["versus", "Versus"],
    ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</nav>
    {mode === "offers" ? <Legacy initialRegion={initialRegion} /> : <Editor key={mode} mode={mode} initialRegion={initialRegion} />}
  </div>;
}
