import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWishlistThreshold } from "../src/lib/wishlist-threshold";

test("wishlist price drafts accept comma or point without coercing typing states", () => {
  for (const value of ["12.50", "12,50", " 12,50 "]) assert.equal(parseWishlistThreshold(value), 12.5);
  assert.equal(parseWishlistThreshold("12."), 12);
  assert.equal(parseWishlistThreshold(",5"), .5);
  for (const value of ["", ".", "-1", "0", "12.345", "1,234.56", "Infinity", "1e3"]) assert.equal(parseWishlistThreshold(value), null);
});
