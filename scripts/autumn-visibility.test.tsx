import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AutumnNavLink } from "../src/app/components/AutumnNavLink";
import { AutumnLeafBudget } from "../src/app/components/AutumnLeafBudget";
import { MobilePrimaryNav } from "../src/app/components/MobilePrimaryNav";
import { activeCatalogFilter, AUTUMN_OFFERS_ENABLED } from "../src/lib/autumn-offers";

test("ended autumn campaign has no navigation or leaf counter", () => {
  assert.equal(AUTUMN_OFFERS_ENABLED, false);
  assert.equal(renderToStaticMarkup(<AutumnNavLink />), "");
  assert.equal(renderToStaticMarkup(<AutumnLeafBudget />), "");
  const nav = renderToStaticMarkup(<MobilePrimaryNav current="library" />);
  assert.doesNotMatch(nav, /ofertas-de-otono/);
  assert.match(nav, /Biblioteca/);
  assert.match(nav, /Comparativa/);
});

test("old autumn filter opens the normal catalog without affecting other filters", () => {
  assert.equal(activeCatalogFilter("otono"), "todos");
  assert.equal(activeCatalogFilter("ofertas"), "ofertas");
});
