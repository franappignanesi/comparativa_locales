import { loadEnvConfig } from "@next/env";
import { load } from "cheerio";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { catalogIdentity, chooseCatalogAdditions, EXCLUDED_PRODUCT, normalizedCatalogTitle, isPackTitle } from "../src/lib/catalog-expansion";
import { getGameSample, buildGameSample, slugifyTitle } from "../src/lib/sample-builder";
import type { GameCandidate, StoreId } from "../src/lib/types";

loadEnvConfig(process.cwd());
type Proposal = { shopId: string; title: string; score: number; reviews: number; positivePct: number; source: string; pack: boolean; status?: string; candidate?: GameCandidate };
type App = { name?: string; type?: string; is_free?: boolean; platforms?: { windows?: boolean }; price_overview?: { final: number }; genres?: Array<{ description: string }>; release_date?: { date?: string; coming_soon?: boolean }; header_image?: string; apps?: Array<{ id: number }>; price?: { final: number }; package_groups?: Array<{ subs?: Array<{ packageid: number; option_text?: string }> }> };
type Deal = { shop: { id: number }; price?: { amount: number }; url?: string };
const output = "data/generated/catalog-expansion.json";
const maxMs = 12 * 60 * 1000;
let deadline = Date.now() + maxMs;
const stores: Record<number, StoreId> = { 61: "steam", 35: "gog", 37: "humble", 16: "epic" };
const knownTitles = new Set<string>();
let requests = 0;
let upstreamBlocked = false;
let proposals: Proposal[] = [];
let before = 0;
let nextSteamRequest = 0;

async function json<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const host = new URL(url).hostname;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline || ++requests > 500) throw Error("Catalog discovery budget exhausted; resume next batch");
    if (host === "store.steampowered.com") {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, nextSteamRequest - Date.now())));
      nextSteamRequest = Date.now() + 3000;
    }
    const response = await fetch(url, { method: body ? "POST" : "GET", signal: AbortSignal.timeout(15000), headers: {
      accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "ITAD-API-Key": key } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 429 && attempt < 2) {
      const retry = response.headers.get("retry-after");
      const requestedDelay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry ?? "") - Date.now()) || 0;
      const delay = Math.max(300000, requestedDelay);
      if (Date.now() + delay + 15000 < deadline) {
        console.log(JSON.stringify({ event: "catalog_upstream_backoff", host, seconds: delay / 1000, attempt: attempt + 1 }));
        await response.arrayBuffer();
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
    if (!response.ok) throw Error(`Upstream HTTP ${response.status} (${host})`);
    return await response.json() as T;
  }
  throw Error(`Upstream HTTP 429 (${host})`);
}

async function checkpoint() {
  await mkdir("data/generated", { recursive: true });
  await writeFile(output, JSON.stringify({ timestamp: new Date().toISOString(), target: 5000, before, proposals }, null, 2) + "\n");
  await mkdir("docs/catalog", { recursive: true });
  const lines = proposals.map(p => `| ${p.title.replace(/\|/g, "/")} | ${p.pack ? "Pack / colección" : "Juego"} | ${p.reviews} | ${p.positivePct}% | ${p.score.toFixed(2)} | ${p.candidate?.expectedStores.join(", ") ?? "Pendiente"} | ${p.status ?? "Por verificar"} |`);
  await writeFile("docs/catalog/incorporaciones.md", `# Incorporaciones curadas hacia 5.000 juegos\n\nCatálogo inicial: ${before}. Generado: ${new Date().toISOString()}.\n\nLa lista NO equivale a incorporaciones publicadas. Se exige juego PC pago, identidad exacta en ITAD y precio actual. Packs: al menos 70% con otra tienda, sin bundles personalizados.\n\n| Título | Tipo | Reseñas | Positivas | Relevancia | Tiendas comprobadas | Estado |\n|---|---|---:|---:|---:|---|---|\n${lines.join("\n")}\n`);
}

async function discover(existing: GameCandidate[]) {
  const ids = new Set(existing.map(catalogIdentity));
  const items = new Map<string, Proposal>();
  // SteamSpy is used only for relevance, never as an authoritative regional price.
  for (let page = 0; page < 10; page++) {
    const data = await json<Record<string, { appid: number; name: string; positive: number; negative: number; price: string; owners: string }>>(`https://steamspy.com/api.php?request=all&page=${page}`);
    for (const g of Object.values(data)) {
      const reviews = (g.positive ?? 0) + (g.negative ?? 0);
      const pct = reviews ? 100 * g.positive / reviews : 0;
      const id = `app/${g.appid}`;
      if (ids.has(id) || knownTitles.has(normalizedCatalogTitle(g.name)) || reviews < 500 || Number(g.price) <= 0 || EXCLUDED_PRODUCT.test(g.name)) continue;
      items.set(id, { shopId: id, title: g.name, reviews, positivePct: Math.round(pct), score: Math.log10(reviews + 1) * 20 + pct * 0.2, source: "SteamSpy: reseñas y valoración", pack: isPackTitle(g.name) });
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  for (const term of ["collection", "complete pack", "trilogy", "anthology", "complete edition", "complete season"]) {
    for (const start of [0, 100]) {
      const url = new URL("https://store.steampowered.com/search/results/");
      for (const [key, value] of Object.entries({ term, start: String(start), count: "100", filter: "topsellers", os: "win", cc: "AR", l: "english", infinite: "1" })) url.searchParams.set(key, value);
      const data = await json<{ results_html: string; total_count: number }>(url.toString());
      const $ = load(data.results_html);
      $("a.search_result_row").each((index, element) => {
        const title = $(element).find(".title").text().trim();
        const href = $(element).attr("href") ?? "";
        const match = href.match(/store\.steampowered\.com\/(app|sub)\/(\d+)\//);
        if (!match || !isPackTitle(title) || EXCLUDED_PRODUCT.test(title) || knownTitles.has(normalizedCatalogTitle(title))) return;
        const id = `${match[1]}/${match[2]}`;
        if (ids.has(id) || items.has(id)) return;
        items.set(id, { shopId: id, title, reviews: 0, positivePct: 0, score: 80 - (start + index) / 10, source: `Steam: packs más vendidos (${term})`, pack: true });
      });
      if (data.total_count <= start + 100) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  const franchises = /\b(bioshock|borderlands|batman|metro|crysis|darksiders|dishonored|fallout|elder scrolls|witcher|hitman|tomb raider|mass effect|dragon age|doom|quake|half.life|portal|resident evil|dead space|assassin|far cry|age of empires|civilization|xcom|command|company of heroes|dark souls|mortal kombat|injustice|saints row|mafia|final fantasy|warhammer|total war|castlevania|mega man)\b/i;
  for (const game of existing.filter(g => g.identifiers.steamAppId && franchises.test(g.title)).slice(0, 120)) {
    try {
      const id = game.identifiers.steamAppId!;
      const data = await json<Record<string, { data?: App }>>(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=AR&l=english`);
      for (const group of data[String(id)]?.data?.package_groups ?? []) for (const sub of group.subs ?? []) {
        const title = load(sub.option_text ?? "").text().replace(/^Buy\s+/i, "").split(/\s+-\s+[$€£]/)[0].trim();
        const shopId = `sub/${sub.packageid}`;
        if (!isPackTitle(title) || EXCLUDED_PRODUCT.test(title) || ids.has(shopId) || items.has(shopId)) continue;
        items.set(shopId, { shopId, title, reviews: 0, positivePct: 0, score: 90, source: `Colección oficial Steam vinculada a ${game.title}`, pack: true });
      }
    } catch { /* A temporary Steam failure must not block the remaining intake. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const ranked = [...items.values()].sort((a, b) => b.score - a.score);
  return [...ranked.filter(p => p.pack), ...ranked.filter(p => !p.pack).slice(0, 1200)];
}

async function verify(p: Proposal, key: string): Promise<GameCandidate | null> {
  const [kind, id] = p.shopId.split("/");
  const details = await json<Record<string, { success: boolean; data?: App }>>(`https://store.steampowered.com/api/${kind === "sub" ? "packagedetails?packageids" : "appdetails?appids"}=${id}&cc=AR&l=english`);
  const app = details[id]?.data;
  if (!details[id]?.success || !app?.name) { p.status = "Sin ficha Steam verificable"; return null; }
  if (kind === "app" && (app.type !== "game" || !app.platforms?.windows || app.is_free || app.release_date?.coming_soon || !app.price_overview?.final)) { p.status = "No es juego PC pago disponible"; return null; }
  if (kind === "sub" && ((app.apps?.length ?? 0) < 2 || !app.price?.final)) { p.status = "Package sin contenido múltiple/precio"; return null; }
  if (EXCLUDED_PRODUCT.test(app.name) || (p.pack && !isPackTitle(app.name))) { p.status = "Contenido no comparable"; return null; }
  const lookup = await json<Record<string, string | null>>("https://api.isthereanydeal.com/lookup/id/shop/61/v1", [p.shopId], key);
  const itadId = lookup[p.shopId];
  if (!itadId) { p.status = "Sin identidad exacta ITAD"; return null; }
  const info = await json<{ title: string; type: string }>(`https://api.isthereanydeal.com/games/info/v2?id=${itadId}`, undefined, key);
  if (normalizedCatalogTitle(info.title) !== normalizedCatalogTitle(app.name)) { p.status = "Edición distinta: requiere revisión manual"; return null; }
  const result = await json<Array<{ id: string; deals?: Deal[] }>>(`https://api.isthereanydeal.com/games/prices/v3?country=AR&shops=${Object.keys(stores).join(",")}&vouchers=false`, [itadId], key);
  const expectedStores = [...new Set((result.find(item => item.id === itadId)?.deals ?? []).filter(d => (d.price?.amount ?? 0) > 0 && d.url && stores[d.shop.id]).map(d => stores[d.shop.id]))];
  if (!expectedStores.includes("steam")) { p.status = "Sin precio Steam actual ITAD; queda pendiente"; return null; }
  p.status = "Verificado";
  const candidate: GameCandidate = { title: app.name, edition: "standard", productKind: p.pack ? "pack" : "game", category: "AA",
    primaryTag: p.pack ? "Packs y colecciones" : app.genres?.[0]?.description ?? "Indie", steamTags: app.genres?.map(g => g.description) ?? [],
    releaseYear: Number(app.release_date?.date?.match(/\b(19|20)\d{2}\b/)?.[0]) || 0,
    coverUrl: app.header_image ?? `https://assets.isthereanydeal.com/${itadId}/banner400.jpg`,
    notes: `Selección curada: ${p.source}. Reseñas: ${p.reviews}, positivas: ${p.positivePct}%. Identidad Steam ${p.shopId} verificada con ITAD ${itadId}.`,
    expectedStores, identifiers: { itadId, ...(kind === "sub" ? { steamSubId: Number(id) } : { steamAppId: Number(id) }) }, confidence: "high" };
  // Fixed packages can contain DLC, but must include a paid PC base game.
  if (kind === "sub") {
    let hasBaseGame = false;
    for (const included of (app.apps ?? []).slice(0, 12)) {
      const response = await json<Record<string, { success: boolean; data?: App }>>(`https://store.steampowered.com/api/appdetails?appids=${included.id}&cc=AR&l=english`);
      const base = response[String(included.id)]?.data;
      if (base?.type === "game" && base.platforms?.windows && !base.is_free) { hasBaseGame = true; break; }
    }
    if (!hasBaseGame) { p.status = "Pack sin juego base PC comprobado"; return null; }
  }
  return candidate;
}

async function main() {
  const sample = await getGameSample();
  const existing: GameCandidate[] = sample.broadSample.map(({ id, availableStores, missingStores, comparisonStatus, ...game }) => game);
  before = existing.length;
  let promotedCount = 0;
  existing.forEach(g => knownTitles.add(normalizedCatalogTitle(g.title)));
  const discoverOnly = process.argv.includes("--discover-only");
  if (discoverOnly) {
    proposals = await discover(existing);
    await writeFile("data/catalog-expansion-intake.json", JSON.stringify({ timestamp: new Date().toISOString(), proposals }, null, 2) + "\n");
  }
  else {
    const key = process.env.ITAD_API_KEY;
    if (!key || key.includes("SENSITIVE")) throw Error("ITAD_API_KEY required for validation; run discovery-only locally or use GitHub Actions");
    try { proposals = JSON.parse(await readFile(output, "utf8")).proposals; }
    catch {
      try { proposals = JSON.parse(await readFile("data/catalog-expansion-intake.json", "utf8")).proposals; }
      catch { proposals = await discover(existing); }
    }
    const limit = Math.min(200, Math.max(1, Number(process.env.CATALOG_EXPANSION_LIMIT) || 200), Math.max(0, 5000 - before));
    if (!limit) { console.log(JSON.stringify({ before, promoted: 0, reason: "target_reached" })); return 0; }
    const pending = proposals.filter(p => !p.status || p.status === "Error temporal");
    const ids = new Set(existing.map(catalogIdentity));
    let verified = proposals.filter(p => p.candidate && !ids.has(p.shopId)).length;
    let packsReady = existing.filter(g => g.productKind === "pack").length + proposals.filter(p => p.candidate?.productKind === "pack" && !ids.has(p.shopId)).length;
    for (const p of pending.sort((a, b) => Number(b.pack) - Number(a.pack) || b.score - a.score)) {
      if (Date.now() > deadline - 30000 || requests > 480 || verified >= 300) break;
      if (ids.has(p.shopId) || (p.pack && packsReady >= 150)) continue;
      try { p.candidate = await verify(p, key) ?? undefined; verified += Number(!!p.candidate); packsReady += Number(p.candidate?.productKind === "pack"); }
      catch (e) {
        p.status = "Error temporal";
        const message = e instanceof Error ? e.message : "upstream error";
        console.warn(JSON.stringify({ title: p.title, error: message }));
        if (/HTTP (?:429|401|403)/.test(message)) { upstreamBlocked = true; break; }
      }
      if (requests % 10 === 0) await checkpoint();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const ready = proposals.flatMap(p => p.candidate ? [p.candidate] : []);
    const selected = chooseCatalogAdditions(ready, existing, limit);
    promotedCount = selected.length;
    const source = JSON.parse(await readFile("data/game-candidates.json", "utf8")) as GameCandidate[];
    const merged = new Map([...source, ...existing, ...selected].map(g => [slugifyTitle(g.title), g]));
    if (selected.length) {
      await writeFile("data/game-candidates.json", JSON.stringify([...merged.values()], null, 2) + "\n");
      await buildGameSample();
      const promoted = new Set(selected.map(catalogIdentity));
      proposals.forEach(p => { if (promoted.has(p.shopId)) p.status = "Incorporado"; });
    }
    const packs = selected.filter(g => g.productKind === "pack");
    const summary = { before, promoted: selected.length, after: before + selected.length, packs: packs.length, comparablePacks: packs.filter(g => g.expectedStores.length > 1).length, requests };
    console.log(JSON.stringify(summary));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Catálogo curado\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nLista de incorporaciones y descartes en el artifact catalog-state.\n`);
  }
  await checkpoint();
  console.log(JSON.stringify({ proposed: proposals.length, packs: proposals.filter(p => p.pack).length, report: "docs/catalog/incorporaciones.md" }));
  return promotedCount;
}
async function run() {
  const massive = process.argv.includes("--until-target");
  if (massive && process.argv.includes("--discover-only")) throw Error("Choose discovery-only or validation, not both");
  for (let batch = 1; batch <= (massive ? 12 : 1); batch++) {
    deadline = Date.now() + maxMs;
    requests = 0;
    console.log(JSON.stringify({ event: "catalog_batch_start", batch, target: 5000 }));
    const promoted = await main();
    if (!promoted || upstreamBlocked) { console.log(JSON.stringify({ event: "catalog_expansion_stopped", batch, reason: upstreamBlocked ? "upstream rate limit or authentication failure" : "target reached or no further validated additions" })); break; }
  }
}
run().catch(async error => { if (proposals.length) await checkpoint(); console.error(error instanceof Error ? error.message : "Catalog expansion failed"); process.exitCode = 1; });
