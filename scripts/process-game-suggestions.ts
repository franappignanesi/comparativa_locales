import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { resolveSuggestionPreview } from "../src/lib/game-suggestion-preview";
import { claimSuggestion, finishSuggestion, queuedIncorporations, markSuggestionPublishing, confirmSuggestionPublished, pruneSuggestionLimits } from "../src/lib/game-suggestion-store";
import { matchGameSuggestion, suggestionCandidateConflict } from "../src/lib/game-suggestion-matching";
import { buildGameSample, getGameSample, slugifyTitle } from "../src/lib/sample-builder";
import { discoverMicrosoftProduct } from "../src/lib/stores/microsoft";
import { STORES } from "../src/lib/types";
import { REGIONS } from "../src/lib/regions";
import type { GameCandidate } from "../src/lib/types";

loadEnvConfig(process.cwd());
const confirm = process.argv.includes("--confirm-published");
const deadline = Date.now() + 5 * 60 * 1000;
let nextSteam = 0;
async function json<T>(url: string, body?: unknown): Promise<T> {
  if (Date.now() > deadline) throw Error("Se agotó el tiempo de búsqueda. Volvé a encolarla.");
  if (new URL(url).hostname === "store.steampowered.com") {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextSteam - Date.now())));
    nextSteam = Date.now() + 3000;
  }
  const response = await fetch(url, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(12000), headers: {
    accept: "application/json", ...(body ? { "content-type": "application/json" } : {}),
    ...(new URL(url).hostname === "api.isthereanydeal.com" ? { "ITAD-API-Key": process.env.ITAD_API_KEY ?? "" } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`La tienda o ITAD no respondió (${response.status}). Volvé a encolar la búsqueda más tarde.`);
  return response.json();
}
async function main() {
  if (!(process.env.POSTGRES_URL || process.env.DATABASE_URL)?.startsWith("postgres")) throw Error("Postgres is required for community suggestions");
  const incorporations = await queuedIncorporations();
  if (confirm) {
    let published = 0;
    for (const item of incorporations.filter(i => i.status === "publishing" && i.gameId)) {
      const data = await json<{ latest?: { prices: Array<{ gameId: string; itadId?: string; prices: Record<string, { available?: boolean; finalPrice?: number | null }> }> } }>(
        `https://www.shuxteam.com/api/catalog?gameId=${encodeURIComponent(item.gameId!)}&region=AR&publication=${process.env.GITHUB_RUN_ID ?? Date.now()}`);
      const row = data.latest?.prices.find(r => r.gameId === item.gameId && r.itadId === item.candidate?.identifiers.itadId);
      if (row && Object.values(row.prices).some(p => p.available && p.finalPrice != null)) { await confirmSuggestionPublished(item.id); published++; }
    }
    console.log(JSON.stringify({ published })); return;
  }
  if (!process.env.ITAD_API_KEY) throw Error("ITAD_API_KEY required for community matching");
  let sample = await getGameSample();
  let searched = 0;
  for (; searched < 10 && Date.now() < deadline - 30000; searched++) {
    const job = await claimSuggestion();
    if (!job) break;
    try {
      const preview = await resolveSuggestionPreview(job.url);
      if (preview.existingGameId) { await finishSuggestion(job, null, "Este juego ya está en el catálogo.", preview.existingGameId); continue; }
      const candidate = await matchGameSuggestion(preview, json);
      const existing = suggestionCandidateConflict(candidate, sample.broadSample);
      if (existing) { await finishSuggestion(job, null, "Este juego ya está en el catálogo.", existing.id); continue; }
      if (!slugifyTitle(candidate.title)) throw Error("El título necesita una URL de ficha definida manualmente.");
      if (sample.broadSample.some(g => g.id === slugifyTitle(candidate.title))) throw Error("La URL de esta edición coincide con otra ficha. Requiere revisión manual.");
      let message = "Identidad y tiendas comprobadas. Podés aprobar la incorporación.";
      if (candidate.productKind !== "pack" && !candidate.identifiers.microsoftProductId) {
        try {
          const productId = await discoverMicrosoftProduct({ ...candidate, id: slugifyTitle(candidate.title), availableStores: candidate.expectedStores,
            missingStores: STORES.filter(s => !candidate.expectedStores.includes(s)), comparisonStatus: "missing_some_stores" }, REGIONS.find(r => r.id === "AR"));
          if (productId) { candidate.identifiers.microsoftProductId = productId; candidate.expectedStores.push("microsoft"); }
        } catch { message += " Microsoft no respondió; no se agregó una coincidencia sin verificar."; }
      }
      await finishSuggestion(job, candidate, message);
    } catch (e) { await finishSuggestion(job, null, e instanceof Error ? e.message : "La búsqueda necesita revisión manual."); }
  }
  const source = JSON.parse(await readFile("data/game-candidates.json", "utf8")) as GameCandidate[];
  const merged = new Map([...source, ...sample.broadSample].map(g => [slugifyTitle(g.title), g]));
  let added = 0;
  for (const item of incorporations) {
    if (!item.candidate) continue;
    const existing = suggestionCandidateConflict(item.candidate, [...merged.values()].map(g => ({ id: slugifyTitle(g.title), identifiers: g.identifiers })));
    const id = existing?.id ?? slugifyTitle(item.candidate.title);
    if (!existing && (!id || merged.has(id))) continue;
    // Publishing rows are replayed after failed refresh/deploy attempts, never acknowledged early.
    if (!await markSuggestionPublishing(item.id, id)) continue;
    if (!existing) { merged.set(id, item.candidate); added++; }
  }
  if (added) {
    await writeFile("data/game-candidates.json", JSON.stringify([...merged.values()], null, 2) + "\n");
    sample = await buildGameSample();
  }
  await pruneSuggestionLimits();
  console.log(JSON.stringify({ searched, added, total: sample.broadSample.length }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Suggestion worker failed"); process.exitCode = 1; });
