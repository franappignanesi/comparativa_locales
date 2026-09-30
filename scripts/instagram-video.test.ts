import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInstagramVideo } from "../src/lib/instagram-video";

function fixture(blocked: boolean | undefined, url = "https://instagram.example.fbcdn.net/video.mp4", shortcode = "sample") {
  const contextJSON = JSON.stringify({ context: { shortcode, copyright_blocked: blocked }, gql_data: { shortcode_media: { shortcode, is_video: true, video_url: url } } });
  return `<script>server.handle(${JSON.stringify({ contextJSON })})</script>`;
}

test("read public video metadata without executing Instagram scripts", () => {
  assert.equal(parseInstagramVideo(fixture(false), "sample").videoUrl, "https://instagram.example.fbcdn.net/video.mp4");
});
test("respect copyright restrictions even if a media URL is present", () => {
  assert.equal(parseInstagramVideo(fixture(true), "sample").videoUrl, null);
  assert.equal(parseInstagramVideo(fixture(undefined), "sample").videoUrl, null);
});
test("reject unsafe hosts and mismatched posts", () => {
  assert.equal(parseInstagramVideo(fixture(false, "https://attacker.example/video.mp4"), "sample").videoUrl, null);
  assert.equal(parseInstagramVideo(fixture(false, "http://instagram.example.fbcdn.net/video.mp4"), "sample").videoUrl, null);
  assert.equal(parseInstagramVideo(fixture(false), "other").videoUrl, null);
});
test("changed markup or missing content falls back to the official embed", () => {
  assert.equal(parseInstagramVideo("<html>Login</html>", "sample").reason, "unavailable");
});
