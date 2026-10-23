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
