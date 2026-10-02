import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeekendGames, parseSteamReviewDate, instagramEmbedUrl } from "../src/lib/weekend-games";

test("only reviews with video are included in Juego del finde", () => {
  const games = getWeekendGames();
  assert.ok(games.length > 0);
  assert.ok(games.every((game) => game.videoUrl && game.reviewDate));
  assert.equal(new Set(games.map((game) => game.steamAppId)).size, games.length);
});

test("Steam dates support explicit years, current year and year rollover", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  assert.equal(parseSteamReviewDate("28 de septiembre", now), "2026-09-28");
  assert.equal(parseSteamReviewDate("10 de julio de 2023", now), "2023-07-10");
  assert.equal(parseSteamReviewDate("31 de diciembre", new Date("2026-01-02T12:00:00Z")), "2025-12-31");
  assert.equal(parseSteamReviewDate("31 de febrero", now), null);
});

test("Instagram embeds accept post and reel links without accepting arbitrary frames", () => {
  assert.equal(instagramEmbedUrl("https://www.instagram.com/reel/abc_123/?utm_source=ig_web"), "https://www.instagram.com/p/abc_123/embed/");
  assert.equal(instagramEmbedUrl("https://instagram.com/p/abc/"), "https://www.instagram.com/p/abc/embed/");
  assert.equal(instagramEmbedUrl("https://www.instagram.com/shuxteam/reel/DcWLtU2vHoO/"), "https://www.instagram.com/p/DcWLtU2vHoO/embed/");
  assert.equal(instagramEmbedUrl("https://www.instagram.com/shuxteam/p/abc/?igsh=example"), "https://www.instagram.com/p/abc/embed/");
  assert.equal(instagramEmbedUrl("https://www.instagram.com/stories/shuxteam/123/"), null);
  assert.equal(instagramEmbedUrl("https://attacker@www.instagram.com/p/abc/"), null);
  assert.equal(instagramEmbedUrl("https://instagram.com.attacker.example/p/abc/"), null);
});
