import { load } from "cheerio";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSteamReviewDate } from "../src/lib/weekend-games";

const curatorId = 35362522;
const sourceUrl = `https://store.steampowered.com/curator/${curatorId}-ShuxTeam/`;
const outputPath = path.join(process.cwd(), "data/shux-weekend-games.json");

export interface CuratorReview {
  steamAppId: number;
  title: string;
  steamUrl: string;
  coverUrl: string | null;
  videoUrl: string | null;
  reviewType: "recommended" | "informational" | "not_recommended";
  reviewDateLabel: string;
  reviewDate: string | null;
  review: string;
}

export function extractVideoUrl(href: string | undefined): string | null {
  if (!href) return null;
  const url = new URL(href, sourceUrl);
  const destination = url.hostname === "steamcommunity.com" && url.pathname === "/linkfilter/"
    ? new URL(url.searchParams.get("u") || url.searchParams.get("url") || sourceUrl)
    : url;
  const hosts = ["instagram.com", "youtube.com", "youtu.be", "tiktok.com"];
  if (destination.protocol !== "https:" || !hosts.some((host) => destination.hostname === host || destination.hostname.endsWith(`.${host}`))) return null;
  return destination.href;
}

export function parseReviews(html: string): CuratorReview[] {
  const $ = load(html);
  return $(".recommendation").toArray().map((element) => {
    const row = $(element);
    const link = row.find("a[data-ds-appid]").first();
    const steamAppId = Number(link.attr("data-ds-appid"));
    const title = link.find("img[alt]").first().attr("alt")?.trim();
    const review = row.find(".recommendation_desc").text().replace(/\s+/g, " ").trim();
    if (!Number.isSafeInteger(steamAppId) || steamAppId <= 0 || !title || !review) {
      throw new Error("Steam changed its review markup; refusing to publish an incomplete list");
    }
    const icon = row.find(".recommendation_type_ctn img").first().attr("src") || "";
    const reviewType = icon.includes("ico_curator_up") ? "recommended"
      : icon.includes("ico_curator_down") ? "not_recommended" : "informational";
    return {
      steamAppId,
      title,
      steamUrl: `https://store.steampowered.com/app/${steamAppId}/`,
      coverUrl: link.find("img[alt]").first().attr("src") || null,
      videoUrl: row.find(".recommendation_readmore a").toArray()
        .map((anchor) => extractVideoUrl($(anchor).attr("href")))
        .find((url) => url !== null) || null,
      reviewType,
      reviewDateLabel: row.find(".curator_review_date").text().trim(),
      reviewDate: parseSteamReviewDate(row.find(".curator_review_date").text().trim(), new Date()),
      review,
    };
  });
}

async function fetchPage(start: number) {
  const url = new URL(`https://store.steampowered.com/curator/${curatorId}/ajaxgetfilteredrecommendations/`);
  url.search = new URLSearchParams({ start: String(start), count: "100", filter: "recent", cc: "ar", l: "spanish" }).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Steam HTTP ${response.status}`);
      const page = await response.json() as { success: number; total_count: number; results_html: string };
      if (page.success !== 1 || !Number.isInteger(page.total_count) || typeof page.results_html !== "string") throw new Error("Invalid Steam response");
      return page;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error("Steam request failed");
}

async function atomicWrite(file: string, contents: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, file);
}

const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

export async function importCurator() {
  const reviews = new Map<number, CuratorReview>();
  let start = 0;
  let total = 0;
  do {
    const page = await fetchPage(start);
    total = page.total_count;
    const batch = parseReviews(page.results_html);
    if (!batch.length) throw new Error(`Empty page at ${start}/${total}; existing list preserved`);
    const sizeBefore = reviews.size;
    batch.forEach((review) => reviews.set(review.steamAppId, review));
    if (reviews.size === sizeBefore) throw new Error("Repeated Steam page; existing list preserved");
    start += batch.length;
    if (start < total) await new Promise((resolve) => setTimeout(resolve, 750));
    if (start > 5000) throw new Error("Unexpected curator size");
  } while (start < total);
  if (reviews.size !== total) throw new Error(`Expected ${total} unique reviews, received ${reviews.size}`);

  let previous: { reviews: CuratorReview[] } | undefined;
  try { previous = JSON.parse(await readFile(outputPath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Keep old entries if a game disappears from Steam or becomes region restricted.
  previous?.reviews.forEach((review) => {
    const current = reviews.get(review.steamAppId);
    if (!current) reviews.set(review.steamAppId, review);
    else if (review.reviewDate && current.reviewDateLabel === review.reviewDateLabel) current.reviewDate = review.reviewDate;
  });
  const records = [...reviews.values()];
  const changed = JSON.stringify(records) !== JSON.stringify(previous?.reviews);
  if (changed) {
    await atomicWrite(outputPath, JSON.stringify({ curatorId, sourceUrl, updatedAt: new Date().toISOString(), reviews: records }, null, 2) + "\n");
  }

  const types = { recommended: "Recomendado", informational: "Informativo", not_recommended: "No recomendado" };
  const markdown = [
    "# Juegos del finde de Shux", "",
    `Fuente: [Mentor de ShuxTeam](${sourceUrl}).`, "",
    `${records.length} reseñas; ${records.filter((r) => r.videoUrl).length} con enlace a video. Se incluyen las reseñas informativas y negativas, identificadas por tipo.`, "",
    "La fecha completa se obtiene de la etiqueta de Steam: cuando omite el año, corresponde al año de la consulta. Los juegos retirados se conservan en importaciones posteriores.", "",
    "| Juego | Fecha en Steam | Tipo | Video | Steam App ID |",
    "| --- | --- | --- | --- | --- |",
    ...records.map((r) => `| [${escapeCell(r.title)}](${r.steamUrl}) | ${escapeCell(r.reviewDateLabel)} | ${types[r.reviewType]} | ${r.videoUrl ? `[Ver video](${r.videoUrl})` : "Sin enlace en Mentor"} | ${r.steamAppId} |`), "",
  ].join("\n");
  await atomicWrite(path.join(process.cwd(), "docs/juegos-del-finde.md"), markdown);
  const quoteCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [
    ["Juego", "Steam App ID", "Fecha en Steam", "Tipo", "Video", "Steam", "Reseña"],
    ...records.map((r) => [r.title, String(r.steamAppId), r.reviewDateLabel, types[r.reviewType], r.videoUrl || "", r.steamUrl, r.review]),
  ].map((row) => row.map(quoteCsv).join(",")).join("\r\n");
  await atomicWrite(path.join(process.cwd(), "docs/juegos-del-finde.csv"), "\uFEFF" + csv + "\r\n");
  console.log(JSON.stringify({ changed, total: records.length, withVideo: records.filter((r) => r.videoUrl).length, sourceUrl }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  importCurator().catch((error) => { console.error(error); process.exitCode = 1; });
}
