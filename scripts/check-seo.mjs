import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";

const base = process.argv[2];
const routes = ["/", "/biblioteca", "/comparativa-general", "/biblioteca/juego-del-finde", "/juegos"];
const titles = new Set();
for (const route of routes) {
  let html;
  if (base) {
    const response = await fetch(`${base}${route}`, { headers: { "user-agent": "Googlebot" }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, route);
    html = await response.text();
  } else html = await readFile(`.next/server/app/${route === "/" ? "index" : route.slice(1)}.html`, "utf8");
  const $ = load(html);
  const title = $("title").text();
  assert.ok(!titles.has(title), `Duplicate title: ${route}`);
  titles.add(title);
  assert.equal($("h1").length, 1, `Expected one server-rendered H1: ${route}`);
  assert.equal($("link[rel=canonical]").attr("href"), `https://www.shuxteam.com${route === "/" ? "" : route}`, `Canonical: ${route}`);
  assert.ok($("meta[property='og:title']").attr("content"), `Missing OG: ${route}`);
  assert.ok($("meta[name='twitter:card']").attr("content"), `Missing Twitter: ${route}`);
  for (const node of $("script[type='application/ld+json']").toArray()) JSON.parse($(node).text());
  if (route === "/biblioteca") assert.ok($("a[href^='/juegos/']").length >= 30, "Library games must be server-rendered crawlable links");
  console.log(JSON.stringify({ route, title, h1: $("h1").text(), gameLinks: $("a[href^='/juegos/']").length }));
}
if (base) {
  const game = await fetch(`${base}/juegos/sea-of-thieves`, { signal: AbortSignal.timeout(30000) });
  assert.equal(game.status, 200);
  const $ = load(await game.text());
  assert.match($("h1").text(), /Sea of Thieves/);
  assert.ok($("tbody tr").length > 0, "Game prices must be in HTML");
  const schema = $("script[type='application/ld+json']").toArray().map((node) => JSON.parse($(node).text()));
  assert.ok(schema.some((value) => value["@type"] === "VideoGame"));
  assert.equal((await fetch(`${base}/robots.txt`)).status, 200);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.ok((sitemap.match(/<loc>/g) ?? []).length > 4000);
  assert.ok(!sitemap.includes("/perfil") && !sitemap.includes("/wishlist") && !sitemap.includes("/admin/"));
  for (const path of ["/perfil", "/wishlist", "/admin/reportes"]) {
    const page = load(await (await fetch(`${base}${path}`)).text());
    assert.match(page("meta[name=robots]").attr("content") ?? "", /noindex/);
  }
  const missing = await fetch(`${base}/juegos/juego-inexistente-seo`, { headers: { "user-agent": "Googlebot" } });
  assert.equal(missing.status, 404);
  const image = await fetch(`${base}/opengraph-image`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  console.log("SEO routes, game HTML, sitemap, robots, noindex, 404 and sharing image: OK");
}
