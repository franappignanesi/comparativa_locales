import assert from "node:assert/strict";
import test from "node:test";
import { wishlistNotificationAllowed, type NotificationPrice, type WishlistNotificationState } from "../src/lib/wishlist-notification-policy";

const current: NotificationPrice = { gameId: "rdr2", region: "AR", currency: "USD", price: 14.77 };
const previous: WishlistNotificationState = { ...current, sentAt: "2026-10-01T00:00:00Z", rearmed: false };
const inside = Date.parse("2026-10-15T00:00:00Z");
const after = Date.parse("2026-11-01T00:00:00Z");

test("the first valid offer is allowed, invalid prices are not", () => {
  assert.equal(wishlistNotificationAllowed(current, undefined, inside), true);
  for (const price of [-1, NaN, Infinity]) assert.equal(wishlistNotificationAllowed({ ...current, price }), false);
  assert.equal(wishlistNotificationAllowed({ ...current, currency: "" }), false);
});

test("RDR2 cent fluctuations and increases do not repeat within or after 30 days", () => {
  for (const price of [14.77, 14.82, 14.8, 14.76, 14.04, 20]) {
    for (const now of [inside, after]) assert.equal(wishlistNotificationAllowed({ ...current, price }, previous, now), false);
  }
  assert.equal(wishlistNotificationAllowed({ ...current, price: 14.03 }, previous, inside), true);
});

test("a drop must be strictly above 5%, including accumulated drops", () => {
  const last = { ...previous, price: 100 };
  for (const price of [99, 97, 95]) assert.equal(wishlistNotificationAllowed({ ...current, price }, last, inside), false);
  assert.equal(wishlistNotificationAllowed({ ...current, price: 94.99 }, last, inside), true);
  const nextSent = { ...last, price: 94.99 };
  assert.equal(wishlistNotificationAllowed({ ...current, price: 94 }, nextSent, inside), false);
});

test("currency or region changes cannot masquerade as discounts", () => {
  assert.equal(wishlistNotificationAllowed({ ...current, currency: "EUR", price: 1 }, previous, inside), false);
  assert.equal(wishlistNotificationAllowed({ ...current, region: "ES", price: 1 }, previous, after), false);
});

test("only a rearmed condition can repeat after 30 days without a substantial drop", () => {
  assert.equal(wishlistNotificationAllowed(current, { ...previous, rearmed: true }, inside), false);
  assert.equal(wishlistNotificationAllowed(current, { ...previous, rearmed: true }, after), true);
  const exactBoundary = Date.parse(previous.sentAt) + 30 * 86400000;
  assert.equal(wishlistNotificationAllowed(current, { ...previous, rearmed: true }, exactBoundary - 1), false);
  assert.equal(wishlistNotificationAllowed(current, { ...previous, rearmed: true }, exactBoundary), true);
});

test("a free price cannot generate another price-drop alert and invalid dates fail closed", () => {
  assert.equal(wishlistNotificationAllowed({ ...current, price: 0 }, { ...previous, price: 0 }, after), false);
  assert.equal(wishlistNotificationAllowed(current, { ...previous, sentAt: "invalid" }, after), false);
  assert.equal(wishlistNotificationAllowed({ ...current, price: 1 }, previous, Date.parse(previous.sentAt) - 1), false);
});
