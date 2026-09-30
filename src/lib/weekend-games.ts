import imported from "../../data/shux-weekend-games.json";

export type WeekendGame = {
  steamAppId: number;
  title: string;
  coverUrl: string | null;
  videoUrl: string;
  reviewDate: string | null;
  reviewDateLabel: string;
  review: string;
  mentorUrl: string;
};

export const WEEKEND_FILTER = "juego-del-finde";

export function parseSteamReviewDate(label: string, referenceDate: Date): string | null {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const match = label.toLowerCase().match(/^(\d{1,2}) de (\w+)(?: de (\d{4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = months.indexOf(match[2]);
  let year = match[3] ? Number(match[3]) : referenceDate.getUTCFullYear();
  if (!match[3] && Date.UTC(year, month, day) > referenceDate.getTime()) year--;
  const date = new Date(Date.UTC(year, month, day));
  if (month < 0 || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function getWeekendGames(): WeekendGame[] {
  return imported.reviews.filter((review) => Boolean(review.videoUrl)).map((review) => ({
    steamAppId: review.steamAppId,
    title: review.title,
    coverUrl: "coverUrl" in review ? review.coverUrl as string | null : null,
    videoUrl: review.videoUrl!,
    reviewDate: review.reviewDate ?? parseSteamReviewDate(review.reviewDateLabel, new Date(imported.updatedAt)),
    reviewDateLabel: review.reviewDateLabel,
    review: review.review,
    mentorUrl: `${imported.sourceUrl}?appid=${review.steamAppId}`,
  }));
}

export function formatWeekendDate(game: WeekendGame): string {
  return game.reviewDate ? game.reviewDate.split("-").reverse().join("/") : game.reviewDateLabel;
}

export function instagramEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/);
    return match ? `https://www.instagram.com/p/${match[1]}/embed/` : null;
  } catch { return null; }
}
