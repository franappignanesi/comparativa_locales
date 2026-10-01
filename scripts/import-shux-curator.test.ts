import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuratorDateOverrides, extractVideoUrl, parseReviews, type CuratorReview } from "./import-shux-curator";

test("backfilled weekend games retain original dates across future imports", () => {
  const ids = [674520, 2201320, 4108000, 4001890, 108600, 123];
  const reviews = ids.map((steamAppId) => ({ steamAppId, reviewDate: "2026-10-01", reviewDateLabel: "1 de octubre" })) as CuratorReview[];
  const corrected = applyCuratorDateOverrides(reviews);
  assert.deepEqual(corrected.map((review) => review.reviewDate), ["2026-09-20", "2026-09-13", "2026-09-05", "2026-08-29", "2026-08-22", "2026-10-01"]);
  assert.equal(corrected[0].reviewDateLabel, "1 de octubre");
  assert.equal(reviews[0].reviewDate, "2026-10-01");
  assert.deepEqual(applyCuratorDateOverrides(corrected), corrected);
});

test("Steam's nested anchors keep the correct game and video together", () => {
  const html = `<div class="recommendation">
    <a data-ds-appid="123" href="https://store.steampowered.com/app/123/"><img alt="Juego &amp; amigos"></a>
    <a class="recommendation_link" href="https://store.steampowered.com/app/123/">
      <div class="recommendation_midcol">
        <div class="recommendation_type_ctn"><img src="ico_curator_up.png"></div>
        <span class="curator_review_date">28 de septiembre</span>
        <div class="recommendation_desc">Una buena recomendación.</div>
        <div class="recommendation_readmore"><a href="https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fwww.instagram.com%2Fp%2Fabc%2F">Ver</a></div>
      </div>
    </a>
  </div>`;
  const [review] = parseReviews(html);
  assert.equal(review.steamAppId, 123);
  assert.equal(review.title, "Juego & amigos");
  assert.equal(review.videoUrl, "https://www.instagram.com/p/abc/");
  assert.equal(review.reviewType, "recommended");
});

test("video URLs reject unrelated hosts and unsafe protocols", () => {
  assert.equal(extractVideoUrl("https://instagram.com.attacker.example/video"), null);
  assert.equal(extractVideoUrl("javascript:alert(1)"), null);
  assert.equal(extractVideoUrl("https://youtu.be/example"), "https://youtu.be/example");
});

test("unexpected Steam markup fails instead of publishing broken entries", () => {
  assert.throws(() => parseReviews('<div class="recommendation"><div>Broken markup</div></div>'));
});
