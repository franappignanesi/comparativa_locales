import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AutumnSelectionVideo } from "../src/app/components/AutumnSelectionVideo";

test("autumn selection embeds the SHUX video without autoplay and links to YouTube", () => {
  const html = renderToStaticMarkup(<AutumnSelectionVideo />);
  assert.match(html, /youtube-nocookie\.com\/embed\/9j-vlNXnpV4/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /allowFullScreen=""/i);
  assert.match(html, /href="https:\/\/www.youtube.com\/watch\?v=9j-vlNXnpV4"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /aria-labelledby="autumn-video-title"/);
  assert.doesNotMatch(html, /autoplay=1/);
});
