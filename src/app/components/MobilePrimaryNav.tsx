import Link from "next/link";
import { Leaf } from "lucide-react";

export function MobilePrimaryNav({ current }: { current: "library" | "autumn" | "comparison" }) {
  return (
    <nav className="mobilePrimaryNav" aria-label="Secciones principales">
      <Link href="/">Inicio</Link>
      <Link href="/biblioteca" aria-current={current === "library" ? "page" : undefined}>Biblioteca</Link>
      <Link href="/ofertas-de-otono" className="mobileAutumnLink" aria-current={current === "autumn" ? "page" : undefined}><Leaf size={14} />Ofertas de otoño</Link>
      <Link href="/comparativa-general" aria-current={current === "comparison" ? "page" : undefined}>Comparativa</Link>
    </nav>
  );
}
