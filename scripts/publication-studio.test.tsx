import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { chartNumber, duplicateStudioPlate, moveStudioPlate, newStudioDraft, newStudioPlate, publicationDimensions, restoreStudioDraft, studioPlateError, studioPrices } from "../src/lib/publication-studio";
import { publicationUploadType } from "../src/lib/publication-studio-storage";
import { PublicationStudioPoster } from "../src/app/components/PublicationStudioPoster";
import type { PublicationGame } from "../src/lib/social-publications";

const game: PublicationGame = { id: "first", title: "Juego uno", region: "AR", coverUrl: "/test.jpg", timestamp: "2026-10-23T12:00:00Z", prices: [
  { store: "steam", label: "Steam", amount: 10, currency: "USD", discount: 50, historicalLow: true, cheapest: false, stale: false, comparisonAmount: 20000 },
  { store: "microsoft", label: "Microsoft", amount: 10000, currency: "ARS", discount: 0, historicalLow: false, cheapest: true, stale: false, comparisonAmount: 10000 },
] };
const games = { first: game, second: { ...game, id: "second", title: "Juego dos", coverUrl: "/second.jpg" } };
let counter = 0;
const id = () => `test-${counter++}`;

test("news and versus plates are freely generatable, duplicated, reordered and removable including CTA", () => {
  for (const mode of ["news", "versus"] as const) {
    const draft = newStudioDraft(mode, "AR", id);
    const custom = newStudioPlate("text-image", id());
    const plates = duplicateStudioPlate([...draft.plates, custom], custom.id, id());
    assert.equal(plates.filter(plate => plate.kind === "text-image").length, mode === "news" ? 3 : 2);
    assert.equal(moveStudioPlate(plates, plates.at(-1)!.id, -1).at(-2)!.id, plates.at(-1)!.id);
    const withoutCta = plates.filter(plate => plate.kind !== "cta");
    assert.ok(withoutCta.length > 0);
    assert.ok(!withoutCta.some(plate => plate.kind === "cta"));
    assert.equal(draft.plates.length, 5);
    const fifteen = Array.from({ length: 15 }, () => newStudioPlate("text", id()));
    assert.equal(duplicateStudioPlate(fifteen, fifteen[0].id, id()), fifteen);
  }
});

test("post and story have distinct native dimensions and story reserves an empty link area", () => {
  assert.deepEqual(publicationDimensions("post"), { width: 1080, height: 1350 });
  assert.deepEqual(publicationDimensions("story"), { width: 1080, height: 1920 });
  const draft = { ...newStudioDraft("story", "AR", id), gameIds: ["first"] };
  const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={draft.plates[0]} games={games} index={0} />);
  assert.match(html, /studio-story/);
  assert.match(html, /studioLinkSlot/);
  assert.match(html, /USD 10/);
  assert.doesNotMatch(html, /Espacio para enlace/);
  assert.equal(studioPlateError(draft.plates[0], ["first"], games), null);
  assert.equal(studioPlateError({ ...draft.plates[0], stores: [] }, ["first"], games), "No hay precios recientes en las tiendas seleccionadas.");
});

test("store visibility recalculates the cheapest offer without comparing nominal currencies", () => {
  assert.equal(studioPrices(game, ["steam"])[0].cheapest, true);
  assert.equal(studioPrices(game, ["steam", "microsoft"])[0].cheapest, false);
  assert.equal(studioPrices({ ...game, prices: game.prices.map(price => ({ ...price, stale: true })) }, ["steam"]).length, 0);
});

test("versus supports independent feature plates and safe two-game price comparisons", () => {
  const draft = { ...newStudioDraft("versus", "AR", id), gameIds: ["first", "second"] };
  assert.equal(draft.plates[1].gameSlot, 0);
  assert.equal(draft.plates[2].gameSlot, 1);
  for (const plate of draft.plates) {
    const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={games} index={0} />);
    assert.ok(html.includes("studioPoster"));
    assert.equal(studioPlateError(plate, draft.gameIds, games), null);
  }
  assert.equal(studioPlateError(draft.plates[0], ["first", "first"], games), "Elegí dos juegos distintos.");
});

test("chart values accept comma or point, reject invalid and negative values, and handle zero", () => {
  assert.equal(chartNumber("10,5"), 10.5);
  assert.equal(chartNumber("0"), 0);
  for (const value of ["", "-1", "NaN", "1e300", "1.2.3", "Infinity"]) assert.equal(chartNumber(value), null);
  const draft = newStudioDraft("comparison", "AR", id);
  const plate = { ...draft.plates[0], rows: [{ id: "a", label: "GPU A", value: "0", image: null, showValue: false }] };
  const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={{}} index={0} />);
  assert.match(html, /width:0%/);
  assert.doesNotMatch(html, /studioBarValue|NaN|Infinity/);
});

test("draft restoration bounds content and rejects remote or executable image sources", () => {
  const draft = newStudioDraft("news", "AR", id);
  draft.plates[0].image = "https://evil.invalid/image.svg";
  draft.plates[0].imageX = 200;
  const restored = restoreStudioDraft(draft, "news")!;
  assert.equal(restored.plates[0].image, null);
  assert.equal(restored.plates[0].imageX, 100);
  assert.equal(restoreStudioDraft(draft, "versus"), null);
  assert.equal(restoreStudioDraft(null, "news"), null);
  assert.equal(publicationUploadType(new TextEncoder().encode("<svg><script")), null);
  assert.equal(publicationUploadType(new Uint8Array([137, 80, 78, 71])), "image/png");
  assert.equal(publicationUploadType(new Uint8Array([255, 216, 255])), "image/jpeg");
});

test("an intentionally empty sequence stays empty and duplicated chart rows remain independent", () => {
  const draft = newStudioDraft("news", "AR", id);
  draft.plates = [];
  assert.deepEqual(restoreStudioDraft(draft, "news")?.plates, []);
  const plate = newStudioPlate("bar-chart", id());
  plate.rows = [{ id: "row", label: "Original", value: "10", image: null, showValue: true }];
  const result = duplicateStudioPlate([plate], plate.id, "duplicate");
  result[1].rows[0].label = "Copy";
  result[1].stores.length = 0;
  assert.equal(plate.rows[0].label, "Original");
  assert.notEqual(result[1].rows[0].id, plate.rows[0].id);
  assert.ok(plate.stores.length > 0);
});

test("giveaways export game identity without prices and use format-specific optional calls to action", () => {
  const draft = { ...newStudioDraft("giveaway", "AR", id), gameIds: ["first"] };
  assert.deepEqual(draft.plates.map(plate => plate.kind), ["giveaway-announcement", "giveaway-winners"]);
  const plate = draft.plates[0];
  const render = () => renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={games} index={0} />);
  assert.match(render(), /Juego uno/);
  assert.match(render(), /Más info en la descripción/);
  assert.doesNotMatch(render(), /USD 10|publicationPrice|studioLinkSlot|Sin impuestos/);
  plate.showMoreInfo = false;
  assert.doesNotMatch(render(), /studioMoreInfo/);
  draft.format = "story";
  assert.match(render(), /studioLinkSlot/);
  assert.doesNotMatch(render(), /studioMoreInfo/);
  plate.reserveLink = false;
  assert.doesNotMatch(render(), /studioLinkSlot/);
  const noPrices = { first: { ...game, prices: [] } };
  assert.equal(studioPlateError(plate, draft.gameIds, noPrices), null);
  assert.equal(studioPlateError(plate, [], noPrices), "Elegí el juego del sorteo.");
});

test("giveaway winners require one to five names, survive restoration and duplicate independently", () => {
  const draft = { ...newStudioDraft("giveaway", "AR", id), gameIds: ["first"] };
  const plate = draft.plates[1];
  for (let count = 1; count <= 5; count++) {
    plate.winners = Array.from({ length: count }, (_, index) => `@ganador-${index + 1}`);
    assert.equal(studioPlateError(plate, draft.gameIds, games), null);
    const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={games} index={1} />);
    assert.equal((html.match(/@ganador-/g) ?? []).length, count);
    assert.doesNotMatch(html, /publicationPrice|studioMoreInfo|studioLinkSlot/);
    assert.deepEqual(restoreStudioDraft(draft, "giveaway")?.plates[1].winners, plate.winners);
  }
  const copy = duplicateStudioPlate(draft.plates, plate.id, id());
  copy[2].winners[0] = "Copy";
  assert.notEqual(plate.winners[0], "Copy");
  for (const names of [[], [" "], Array(6).fill("x")]) {
    assert.match(studioPlateError({ ...plate, winners: names }, draft.gameIds, games)!, /ganadores/);
  }
  plate.winners = Array(8).fill("x".repeat(100));
  assert.deepEqual(restoreStudioDraft(draft, "giveaway")!.plates[1].winners, Array(5).fill("x".repeat(70)));
});

test("versus crops are independent in the split cover and price plates and remain backward compatible", () => {
  const draft = { ...newStudioDraft("versus", "AR", id), gameIds: ["first", "second"] };
  for (const plate of [draft.plates[0], draft.plates[3]]) {
    Object.assign(plate, { imageX: 15, imageY: 25, secondX: 85, secondY: 75 });
    const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={games} index={0} />);
    assert.match(html, /object-position:15% 25%/);
    assert.match(html, /object-position:85% 75%/);
  }
  const legacy = JSON.parse(JSON.stringify(draft));
  delete legacy.plates[0].winners;
  delete legacy.plates[0].showMoreInfo;
  legacy.plates[0].secondX = -100;
  const restored = restoreStudioDraft(legacy, "versus")!;
  assert.equal(restored.plates[0].imageX, 15);
  assert.equal(restored.plates[0].secondX, 0);
  assert.deepEqual(restored.plates[0].winners, [""]);
});

test("giveaway, versus and comparison headers omit country and numbering without changing news or stories", () => {
  for (const mode of ["giveaway", "versus", "comparison", "news", "story"] as const) {
    const draft = { ...newStudioDraft(mode, "AR", id), gameIds: ["first", "second"] };
    const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={draft.plates[0]} games={games} index={0} />);
    const header = html.match(/<header class="studioHeader">(.*?)<\/header>/)![1];
    if (mode === "news" || mode === "story") assert.match(header, /<small>/);
    else assert.doesNotMatch(header, /<small>|Argentina|<span>/);
    assert.match(header, mode === "news" ? /SHUX/ : /BARATEAM/);
  }
});

test("giveaway framing reaches both slides and the description precedes the footer", () => {
  const draft = { ...newStudioDraft("giveaway", "AR", id), gameIds: ["first"] };
  for (const plate of draft.plates) {
    plate.imageX = 20; plate.imageY = 80; plate.body = "Participá con SHUX";
    const html = renderToStaticMarkup(<PublicationStudioPoster draft={draft} plate={plate} games={games} index={0} />);
    assert.match(html, /object-position:20% 80%/);
    assert.match(html, /studioGiveawayContent/);
    assert.ok(html.indexOf("Participá con SHUX") < html.indexOf('<footer class="studioFooter">'));
  }
});
