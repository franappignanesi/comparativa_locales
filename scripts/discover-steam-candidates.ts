import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import type { GameCandidate, GameCategory } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SteamSpyGame = {
  appid: number;
  name: string;
  positive?: number;
  negative?: number;
  average_forever?: number;
  owners?: string;
  price?: string;
  initialprice?: string;
  tags?: Record<string, number>;
  genre?: string;
};

type DiscoveryFile = {
  timestamp: string;
  source: string;
  target: number;
  generated: number;
  rules: string[];
  candidates: GameCandidate[];
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const target = parsePositiveInt(process.env.CATALOG_DISCOVERY_TARGET) ?? 2000;
  const pages = parsePositiveInt(process.env.STEAMSPY_PAGES) ?? 4;
  const minReviews = parsePositiveInt(process.env.CATALOG_MIN_REVIEWS) ?? 500;
  const minOwners = parsePositiveInt(process.env.CATALOG_MIN_OWNERS) ?? 20000;
  const existing = await readJson<GameCandidate[]>(dataPath("game-candidates.json"), []);
  const existingSteamIds = new Set(existing.map((game) => game.identifiers.steamAppId).filter(Boolean));
  const existingTitles = new Set(existing.map((game) => normalizeTitle(game.title)));
  const discovered: SteamSpyGame[] = [];

  for (let page = 0; page < pages; page += 1) {
    const response = await fetch(`https://steamspy.com/api.php?request=all&page=${page}`);
    if (!response.ok) throw new Error(`SteamSpy page ${page} failed: ${response.status}`);
    const data = (await response.json()) as Record<string, SteamSpyGame>;
    discovered.push(...Object.values(data));
  }

  const candidates = discovered
    .filter((game) => !existingSteamIds.has(game.appid))
    .filter((game) => !existingTitles.has(normalizeTitle(game.name)))
    .filter((game) => reviewCount(game) >= minReviews)
    .filter((game) => estimatedOwners(game) >= minOwners)
    .filter((game) => !isFreeOrUnsupported(game))
    .sort((a, b) => scoreGame(b) - scoreGame(a))
    .slice(0, target)
    .map(toCandidate);

  const file: DiscoveryFile = {
    timestamp: new Date().toISOString(),
    source: `SteamSpy request=all pages=${pages}`,
    target,
    generated: candidates.length,
    rules: [
      "Excluir juegos ya presentes por steamAppId o titulo normalizado.",
      "Excluir F2P, demos, DLC, soundtracks, tools y bundles por tags/titulo/precio.",
      `Exigir al menos ${minReviews} reviews positivas+negativas.`,
      `Exigir al menos ${minOwners} owners estimados.`,
      "Ordenar por volumen de reviews y tiempo jugado como proxy de relevancia.",
      "Generar intake masivo seguro; se promueve al catalogo con catalog:promote-discovered."
    ],
    candidates
  };

  await writeJson(dataPath("generated", "steam-discovery-candidates.json"), file);
  console.log(JSON.stringify({ generated: file.generated, target, pages, minReviews, minOwners }, null, 2));
}

function toCandidate(game: SteamSpyGame): GameCandidate {
  return {
    title: game.name,
    edition: "standard",
    category: inferCategory(game),
    primaryTag: primaryTag(game),
    steamTags: Object.keys(game.tags ?? {}).slice(0, 12),
    releaseYear: 0,
    notes: `Steam discovery intake. Reviews: ${reviewCount(game)}. Positive: ${positiveRatio(game)}%. Owners: ${game.owners ?? "unknown"}. Aprobable en masa por umbrales de popularidad.`,
    expectedStores: ["steam"],
    identifiers: {
      steamAppId: game.appid,
      epicSlug: null,
      gogSlug: null,
      humbleSlug: null,
      microsoftProductId: null,
      microsoftUrl: null
    },
    confidence: "high"
  };
}

function inferCategory(game: SteamSpyGame): GameCategory {
  const tags = Object.keys(game.tags ?? {}).map((tag) => tag.toLowerCase());
  const genres = (game.genre ?? "").toLowerCase();
  if (tags.some((tag) => tag.includes("indie")) || genres.includes("indie")) return "indie popular";
  if (tags.some((tag) => tag.includes("massively multiplayer") || tag.includes("multiplayer"))) return "multiplayer pago";
  if (reviewCount(game) > 50000) return "AAA viejo";
  return "AA";
}

function primaryTag(game: SteamSpyGame): string {
  const tags = Object.keys(game.tags ?? {});
  const priority = [
    "Action",
    "Adventure",
    "RPG",
    "Strategy",
    "Simulation",
    "Indie",
    "Sports",
    "Racing",
    "Casual",
    "Massively Multiplayer",
    "Multiplayer"
  ];
  return priority.find((tag) => tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) ?? tags[0] ?? primaryGenre(game.genre) ?? "Otros";
}

function primaryGenre(genre: string | undefined): string | null {
  const first = genre?.split(",").map((item) => item.trim()).filter(Boolean)[0];
  return first ?? null;
}

function isFreeOrUnsupported(game: SteamSpyGame): boolean {
  const title = game.name.toLowerCase();
  const tags = Object.keys(game.tags ?? {}).map((tag) => tag.toLowerCase());
  const price = Number(game.initialprice ?? game.price ?? 0);
  return (
    price <= 0 ||
    title.includes("demo") ||
    title.includes("soundtrack") ||
    title.includes(" dlc") ||
    title.includes("bundle") ||
    tags.some((tag) => ["free to play", "demo", "software", "utilities", "video production", "animation & modeling"].includes(tag))
  );
}

function scoreGame(game: SteamSpyGame): number {
  return reviewCount(game) * 2 + (game.average_forever ?? 0);
}

function reviewCount(game: SteamSpyGame): number {
  return (game.positive ?? 0) + (game.negative ?? 0);
}

function positiveRatio(game: SteamSpyGame): number {
  const total = reviewCount(game);
  if (!total) return 0;
  return Math.round(((game.positive ?? 0) / total) * 100);
}

function estimatedOwners(game: SteamSpyGame): number {
  const match = game.owners?.match(/[\d,]+/);
  return match ? Number(match[0].replace(/,/g, "")) : 0;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
