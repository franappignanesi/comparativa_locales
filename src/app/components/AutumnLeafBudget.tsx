"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";
import { useEffect, useState } from "react";
import { AUTUMN_PATH } from "@/lib/autumn-offers";

export function AutumnLeafBudget({ userSub, votes, ready }: { userSub?: string; votes?: string[]; ready?: boolean }) {
  const [saved, setSaved] = useState<{ userSub: string; count: number } | null>(null);
  const supplied = votes !== undefined;
  useEffect(() => {
    setSaved(null);
    if (!userSub || supplied) return;
    const controller = new AbortController();
    fetch("/api/user/offer-votes", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("Votes unavailable");
        return response.json() as Promise<{ votes: string[] }>;
      })
      .then(result => { if (!controller.signal.aborted && Array.isArray(result.votes)) setSaved({ userSub, count: result.votes.length }); })
      .catch(() => { /* Do not invent an available balance when storage is unavailable. */ });
    return () => controller.abort();
  }, [userSub, supplied]);
  const count = !userSub ? 0 : supplied ? ready ? votes.length : null : saved?.userSub === userSub ? saved.count : null;
  const remaining = count == null ? "…" : Math.max(0, 5 - count);
  return <Link href={AUTUMN_PATH} className="autumnLeafBudget" title="Hojas de otoño disponibles"
    aria-label={`Hojas de otoño disponibles: ${remaining} de 5`}><Leaf size={17} aria-hidden="true" /><span>{remaining}/5</span></Link>;
}
