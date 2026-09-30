import { load } from "cheerio";

export type InstagramVideo = { videoUrl: string | null; reason: "available" | "restricted" | "unavailable" };

export function parseInstagramVideo(html: string, shortcode: string): InstagramVideo {
  const $ = load(html);
  // Instagram serializes its embed context as a JSON string inside ServerJS.
  for (const script of $("script").toArray()) {
    const match = $(script).text().match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/);
    if (!match) continue;
    try {
      const data = JSON.parse(JSON.parse(match[1])) as {
        context?: { shortcode?: string; copyright_blocked?: boolean };
        gql_data?: { shortcode_media?: { shortcode?: string; is_video?: boolean; video_url?: string } };
      };
      const media = data.gql_data?.shortcode_media;
      if (data.context?.shortcode !== shortcode || media?.shortcode !== shortcode) continue;
      if (data.context.copyright_blocked !== false) return { videoUrl: null, reason: "restricted" };
      if (!media.is_video || !media.video_url) continue;
      const url = new URL(media.video_url);
      if (url.protocol === "https:" && url.hostname.endsWith(".fbcdn.net")) return { videoUrl: url.href, reason: "available" };
    } catch { continue; }
  }
  return { videoUrl: null, reason: "unavailable" };
}
