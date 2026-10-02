import Link from "next/link";
import { Leaf } from "lucide-react";
import { AUTUMN_PATH } from "@/lib/autumn-offers";

export function AutumnNavLink({ active = false }: { active?: boolean }) {
  return <Link href={AUTUMN_PATH} className={`sideLink autumnNavLink${active ? " active" : ""}`}><Leaf size={20} />Ofertas de otoño</Link>;
}
