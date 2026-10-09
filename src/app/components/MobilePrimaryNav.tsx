import Link from "next/link";
import { Leaf } from "lucide-react";
import { AUTUMN_OFFERS_ENABLED } from "@/lib/autumn-offers";

export function MobilePrimaryNav({ current }: { current: "library" | "autumn" | "comparison" }) {
  return (
    <nav className="mobilePrimaryNav" aria-label="Secciones principales">
      <Link href="/">Inicio</Link>
      <Link href="/biblioteca" aria-current={current === "library" ? "page" : undefined}>Biblioteca</Link>
      {AUTUMN_OFFERS_ENABLED ? <Link href="/ofertas-de-otono" className="mobileAutumnLink" aria-current={current === "autumn" ? "page" : undefined}><Leaf size={14} />Ofertas de otoño</Link> : null}
      <Link href="/comparativa-general" aria-current={current === "comparison" ? "page" : undefined}>Comparativa</Link>
    </nav>
  );
}
