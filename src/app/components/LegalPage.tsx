import Link from "next/link";
import type { ReactNode } from "react";
import { LegalLinks } from "./LegalLinks";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="legalPage">
    <nav className="legalPageNav" aria-label="Navegación">
      <Link href="/">BARATEAM</Link><Link href="/biblioteca">Volver a la biblioteca</Link>
    </nav>
    <article>
      <header><h1>{title}</h1><p className="legalUpdated">Última actualización: <time dateTime="2026-10-01">1 de octubre de 2026</time></p></header>
      {children}
    </article>
    <footer className="legalPageFooter"><p>BARATEAM, una herramienta de Shux.</p><LegalLinks /></footer>
  </main>;
}
