import assert from "node:assert/strict";
import { test } from "node:test";
import { rankWishlists } from "../src/lib/wishlist-ranking";

test("wishlist popularity counts each user only once per game", () => {
  assert.deepEqual(rankWishlists([[{ gameId: "a" }, { gameId: "a" }], [{ gameId: "a" }, { gameId: "b" }]]), [{ gameId: "a", saves: 2 }, { gameId: "b", saves: 1 }]);
});
test("wishlist popularity has deterministic tie ordering", () => {
  assert.deepEqual(rankWishlists([[{ gameId: "z" }, { gameId: "a" }]]).map((game) => game.gameId), ["a", "z"]);
});
test("empty wishlists do not fabricate a ranking", () => {
  assert.deepEqual(rankWishlists([[], []]), []);
});
