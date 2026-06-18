import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import type { GameCandidate, GameCategory } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SteamSearchItem = {
  appId: number;
  title: string;
  rank: number;
  source: string;
};

type SteamAppDetails = {
  success?: boolean;
  data?: {
    name?: string;
    type?: string;
    is_free?: boolean;
    release_date?: { date?: string; coming_soon?: boolean };
    price_overview?: { initial?: number; final?: number; currency?: string };
    genres?: Array<{ description?: string }>;
    categories?: Array<{ description?: string }>;
  };
};

type SteamSpyDetails = {
  appid?: number;
  name?: string;
  positive?: number;
  negative?: number;
  owners?: string;
  tags?: Record<string, number>;
  genre?: string;
};

type PendingRelease = {
  discoveredAt: string;
  updatedAt: string;
  appId: number;
  title: string;
  releaseDate: string | null;
  releaseYear: number;
  reviews: number;
  owners: number;
  rank: number;
  sources: string[];
  score: number;
  status: "pending" | "fast_lane" | "rejected" | "promoted";
  reason: string;
  candidate?: GameCandidate;
};

type PendingReleaseFile = {
  timestamp: string;
  source: string;
  rules: string[];
  pending: PendingRelease[];
};

const SEARCH_FILTERS = ["popularnew", "topsellers", "newreleases"];
const DEFAULT_LOOKBACK_DAYS = 90;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const lookbackDays = parsePositiveInt(process.env.RELEASE_DISCOVERY_LOOKBACK_DAYS) ?? DEFAULT_LOOKBACK_DAYS;
  const countPerFilter = parsePositiveInt(process.env.RELEASE_DISCOVERY_COUNT) ?? 100;
  const existing = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const previous = await readJson<PendingReleaseFile>(dataPath("generated", "pending-releases.json"), emptyPendingFile());
  const existingSteamIds = new Set(existing.map((game) => game.identifiers.steamAppId).filter(Boolean));
  const existingTitles = new Set(existing.map((game) => normalizeTitle(game.title)));
  const previousByAppId = new Map(previous.pending.map((item) => [item.appId, item]));
  const searchItems = await discoverSearchItems(countPerFilter);
  const uniqueItems = [...new Map(searchItems.map((item) => [item.appId, item])).values()].filter((item) => !existingSteamIds.has(item.appId));
  const details = await fetchAppDetails(uniqueItems.map((item) => item.appId));
  const pending: PendingRelease[] = [];

  for (const item of uniqueItems) {
    const app = details.get(item.appId);
    const appData = app?.data;
    if (!app?.success || !appData || appData.type !== "game") continue;
    const title = appData.name ?? item.title;
    const previousItem = previousByAppId.get(item.appId);
    if (existingTitles.has(normalizeTitle(title))) continue;

    const releaseDate = parseSteamDate(appData.release_date?.date);
    const releaseYear = releaseDate?.getFullYear() ?? 0;
    const steamSpy = await fetchSteamSpyDetails(item.appId);
    const reviews = reviewCount(steamSpy);
    const owners = estimatedOwners(steamSpy);
    const statusReason = classifyRelease({ app: appData, releaseDate, lookbackDays, rank: item.rank, reviews, owners, title });
    const candidate = statusReason.status === "rejected" ? undefined : toCandidate({ appId: item.appId, title, app: appData, steamSpy, releaseYear, reason: statusReason.reason });

    pending.push({
      discoveredAt: previousItem?.discoveredAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appId: item.appId,
      title,
      releaseDate: releaseDate?.toISOString() ?? null,
      releaseYear,
      reviews,
      owners,
      rank: item.rank,
      sources: [...new Set([...(previousItem?.sources ?? []), item.source])],
      score: scoreRelease({ rank: item.rank, reviews, owners, releaseDate }),
      status: previousItem?.status === "promoted" ? "promoted" : statusReason.status,
      reason: statusReason.reason,
      candidate
    });
  }

  const merged = mergePending(previous.pending, pending);
  const file: PendingReleaseFile = {
    timestamp: new Date().toISOString(),
    source: `Steam search filters=${SEARCH_FILTERS.join(",")}`,
    rules: [
      `Discovery diario mira hasta ${lookbackDays} dias hacia atras.`,
      "No agrega directo al catalogo: escribe pending-releases.json.",
      "Fast lane: rank alto o volumen fuerte de reviews/owners.",
      "Rechaza F2P, DLC, demos, soundtracks, tools y juegos no pagos cuando Steam no devuelve price_overview."
    ],
    pending: merged.sort((a, b) => b.score - a.score)
  };

  await writeJson(dataPath("generated", "pending-releases.json"), file);
  console.log(
    JSON.stringify(
      {
        discovered: pending.length,
        totalPending: file.pending.filter((item) => item.status === "pending").length,
        fastLane: file.pending.filter((item) => item.status === "fast_lane").length,
        rejected: file.pending.filter((item) => item.status === "rejected").length
      },
      null,
      2
    )
  );
}

async function discoverSearchItems(countPerFilter: number): Promise<SteamSearchItem[]> {
  const items: SteamSearchItem[] = [];
  for (const filter of SEARCH_FILTERS) {
    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("query", "");
    url.searchParams.set("start", "0");
    url.searchParams.set("count", String(countPerFilter));
    url.searchParams.set("dynamic_data", "");
    url.searchParams.set("category1", "998");
    url.searchParams.set("os", "win");
    url.searchParams.set("filter", filter);
    url.searchParams.set("infinite", "1");
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) continue;
    const data = (await response.json()) as { results_html?: string };
    const appIds = [...(data.results_html ?? "").matchAll(/data-ds-appid="(\d+)"/g)].map((match) => Number(match[1]));
    const titles = [...(data.results_html ?? "").matchAll(/<span class="title">([^<]+)<\/span>/g)].map((match) => decodeHtml(match[1]));
    appIds.forEach((appId, index) => {
      items.push({ appId, title: titles[index] ?? `Steam App ${appId}`, rank: index + 1, source: filter });
    });
  }
  return items;
}

async function fetchAppDetails(appIds: number[]): Promise<Map<number, SteamAppDetails>> {
  const result = new Map<number, SteamAppDetails>();
  for (const chunk of chunkArray(appIds, 50)) {
    const url = `https://store.steampowered.com/api/appdetails?appids=${chunk.join(",")}&cc=AR&l=spanish&filters=basic,price_overview,genres,categories,release_date`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) continue;
    const json = (await response.json()) as Record<string, SteamAppDetails>;
    for (const appId of chunk) result.set(appId, json[String(appId)]);
  }
  return result;
}

async function fetchSteamSpyDetails(appId: number): Promise<SteamSpyDetails> {
  try {
    const response = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
    if (!response.ok) return {};
    return (await response.json()) as SteamSpyDetails;
  } catch {
    return {};
  }
}

function classifyRelease(input: {
  app: NonNullable<SteamAppDetails["data"]>;
  releaseDate: Date | null;
  lookbackDays: number;
  rank: number;
  reviews: number;
  owners: number;
  title: string;
}): { status: PendingRelease["status"]; reason: string } {
  if (isUnsupported(input.app, input.title)) return { status: "rejected", reason: "F2P, DLC, demo, soundtrack, tool o sin precio pago verificable." };
  if (!input.releaseDate) return { status: "pending", reason: "Sin fecha parseable; requiere observacion." };
  const ageDays = (Date.now() - input.releaseDate.getTime()) / 86400000;
  if (input.app.release_date?.coming_soon) return { status: "pending", reason: "Coming soon; observar hasta lanzamiento." };
  if (ageDays > input.lookbackDays) return { status: "rejected", reason: `Fuera de ventana de ${input.lookbackDays} dias.` };
  if (input.rank <= 30 || input.reviews >= 300 || input.owners >= 20000) return { status: "fast_lane", reason: "Release reciente con senal fuerte: ranking, reviews u owners." };
  return { status: "pending", reason: "Release reciente valido, espera promocion semanal o mas senales." };
}

function toCandidate(input: {
  appId: number;
  title: string;
  app: NonNullable<SteamAppDetails["data"]>;
  steamSpy: SteamSpyDetails;
  releaseYear: number;
  reason: string;
}): GameCandidate {
  const tags = Object.keys(input.steamSpy.tags ?? {});
  const genreTags = (input.steamSpy.genre ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const steamTags = [...new Set([...tags, ...genreTags])].slice(0, 16);
  return {
    title: input.title,
    edition: "standard",
    category: inferCategory(steamTags, input.steamSpy),
    primaryTag: primaryTag(steamTags),
    steamTags,
    releaseYear: input.releaseYear,
    notes: `Release discovery. ${input.reason} Reviews: ${reviewCount(input.steamSpy)}. Owners: ${input.steamSpy.owners ?? "unknown"}.`,
    expectedStores: ["steam"],
    identifiers: {
      steamAppId: input.appId,
      epicSlug: null,
      gogSlug: null,
      humbleSlug: null,
      microsoftProductId: null,
      microsoftUrl: null
    },
    confidence: "high"
  };
}

function isUnsupported(app: NonNullable<SteamAppDetails["data"]>, title: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const categories = app.categories?.map((category) => category.description?.toLowerCase() ?? "") ?? [];
  return (
    app.is_free ||
    !app.price_overview ||
    (app.price_overview.initial ?? 0) <= 0 ||
    normalizedTitle.includes("demo") ||
    normalizedTitle.includes("soundtrack") ||
    normalizedTitle.includes(" dlc") ||
    normalizedTitle.includes("bundle") ||
    categories.some((category) => category.includes("downloadable content"))
  );
}

function inferCategory(tags: string[], steamSpy: SteamSpyDetails): GameCategory {
  const lowerTags = tags.map((tag) => tag.toLowerCase());
  if (lowerTags.some((tag) => tag.includes("indie"))) return "indie popular";
  if (lowerTags.some((tag) => tag.includes("massively multiplayer") || tag.includes("multiplayer"))) return "multiplayer pago";
  if (reviewCount(steamSpy) > 20000 || estimatedOwners(steamSpy) > 200000) return "AAA nuevo";
  return "AA";
}

function primaryTag(tags: string[]): string | null {
  const priority = ["Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Sports", "Racing", "Casual", "Massively Multiplayer", "Multiplayer"];
  return priority.find((tag) => tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) ?? tags[0] ?? null;
}

function mergePending(previous: PendingRelease[], next: PendingRelease[]): PendingRelease[] {
  const byAppId = new Map(previous.map((item) => [item.appId, item]));
  for (const item of next) {
    const existing = byAppId.get(item.appId);
    byAppId.set(item.appId, existing ? { ...existing, ...item, discoveredAt: existing.discoveredAt, sources: [...new Set([...existing.sources, ...item.sources])] } : item);
  }
  return [...byAppId.values()];
}

function parseSteamDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function scoreRelease(input: { rank: number; reviews: number; owners: number; releaseDate: Date | null }): number {
  const recency = input.releaseDate ? Math.max(0, 90 - (Date.now() - input.releaseDate.getTime()) / 86400000) : 0;
  return Math.round(recency * 10 + input.reviews * 3 + input.owners / 1000 + Math.max(0, 120 - input.rank));
}

function reviewCount(game: SteamSpyDetails): number {
  return (game.positive ?? 0) + (game.negative ?? 0);
}

function estimatedOwners(game: SteamSpyDetails): number {
  const match = game.owners?.match(/[\d,]+/);
  return match ? Number(match[0].replace(/,/g, "")) : 0;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function emptyPendingFile(): PendingReleaseFile {
  return { timestamp: null as unknown as string, source: "empty", rules: [], pending: [] };
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
